import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

const getSb1 = () =>
  createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

const getSb2 = () =>
  createClient(
    Netlify.env.get('SUPABASE_2_URL'),
    Netlify.env.get('SUPABASE_2_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

const errorResponse = (status, message) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function authenticateMember(sb1, deviceId) {
  if (!deviceId) return null;
  const { data: session } = await sb1
    .from('member_sessions')
    .select('member_id')
    .eq('device_id', deviceId)
    .eq('is_active', true)
    .maybeSingle();
  if (!session) return null;
  const { data: member } = await sb1
    .from('members')
    .select('id, email, full_name')
    .eq('id', session.member_id)
    .maybeSingle();
  if (!member?.email) return null;
  return member;
}

async function watermarkPdf(bytes, viewerEmail) {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const now = new Date();
  const dateLine = now.toUTCString().replace(' GMT', ' UTC');
  const teal = rgb(0.067, 0.529, 0.553);
  const black = rgb(0.15, 0.15, 0.15);

  // perpY = visual-center offset along the axis perpendicular to the text
  // direction (rotated 30°). 0 = page center. Values picked so the block's
  // visual extent is symmetric around 0 (top of CONFIDENTIAL ≈ +120,
  // bottom of "Viewed by" ≈ -125) and small lines are far enough apart that
  // they no longer overlap.
  // `xShift` is a pure horizontal nudge (page-x, not rotated-axis), applied
  // after the rotated-frame layout. Used to tweak CONFIDENTIAL's apparent
  // horizontal position without affecting the rest of the block.
  const lines = [
    { text: 'CONFIDENTIAL',             font: bold,    size: 96, opacity: 0.18, color: teal,  perpY:  72, xShift: 40 },
    { text: 'AV Clubs',                 font: bold,    size: 28, opacity: 0.45, color: black, perpY: -25 },
    { text: 'clubs@av.vc',              font: regular, size: 22, opacity: 0.45, color: black, perpY: -60 },
    { text: dateLine,                   font: regular, size: 20, opacity: 0.45, color: black, perpY: -90 },
    { text: `Viewed by ${viewerEmail}`, font: regular, size: 20, opacity: 0.45, color: black, perpY: -118 },
  ];

  const angle = (30 * Math.PI) / 180;
  const cosT = Math.cos(angle);
  const sinT = Math.sin(angle);
  const rot = degrees(30);

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    const cx = width / 2;
    const cy = height / 2;

    for (const line of lines) {
      const textWidth = line.font.widthOfTextAtSize(line.text, line.size);
      // Each line's visual center sits at (cx, cy) + perpY * (-sinT, cosT).
      // drawText anchors at the baseline (origin = bottom-left of rotated
      // text), so drop the perpY by ~0.35*size to bring the visual center
      // (not the baseline) onto perpY, then shift back along the text axis
      // by half the text width to center the line horizontally too.
      const baselinePerpY = line.perpY - line.size * 0.35;
      const baselineCenterX = cx + baselinePerpY * (-sinT) + (line.xShift || 0);
      const baselineCenterY = cy + baselinePerpY * cosT;
      const originX = baselineCenterX - cosT * (textWidth / 2);
      const originY = baselineCenterY - sinT * (textWidth / 2);

      page.drawText(line.text, {
        x: originX,
        y: originY,
        size: line.size,
        font: line.font,
        color: line.color,
        opacity: line.opacity,
        rotate: rot,
      });
    }
  }

  return await pdfDoc.save();
}

export default async (req) => {
  if (req.method !== 'GET') return errorResponse(405, 'Method not allowed');

  try {
    const url = new URL(req.url);
    const materialId = url.searchParams.get('id');
    if (!materialId) return errorResponse(400, 'Missing id');

    const deviceId = req.headers.get('x-device-id') || url.searchParams.get('device_id');
    const sb1 = getSb1();
    const member = await authenticateMember(sb1, deviceId);
    if (!member) return errorResponse(401, 'Not authenticated');

    const isAdmin = (member.email || '').toLowerCase().endsWith('@av.vc');

    const sb2 = getSb2();
    const { data: material, error: matErr } = await sb2
      .from('deal_materials')
      .select('id, deal_id, storage_path, url, material_type, file_name, is_archived')
      .eq('id', materialId)
      .maybeSingle();

    if (matErr) throw matErr;
    if (!material || material.is_archived) return errorResponse(404, 'Not found');

    // Non-admins: confirm the material's deal is still visible (active or recently closed).
    // The existing flow already gates per-deal visibility at the listing layer, but we
    // re-check on the proxy in case a stale id leaks.
    if (!isAdmin) {
      const { data: deal } = await sb2
        .from('deals')
        .select('id')
        .eq('id', material.deal_id)
        .maybeSingle();
      if (!deal) return errorResponse(403, 'Forbidden');
    }

    // Fetch the original bytes using a short-lived server-side signed URL.
    let sourceUrl = material.url || null;
    if (material.storage_path) {
      const { data: signed, error: signErr } = await sb2.storage
        .from('deal-materials')
        .createSignedUrl(material.storage_path, 600);
      if (signErr || !signed?.signedUrl) return errorResponse(500, 'Failed to sign source');
      sourceUrl = signed.signedUrl;
    }
    if (!sourceUrl) return errorResponse(404, 'No source');

    const upstream = await fetch(sourceUrl);
    if (!upstream.ok) return errorResponse(502, `Upstream ${upstream.status}`);
    const upstreamType = upstream.headers.get('content-type') || '';
    const buf = new Uint8Array(await upstream.arrayBuffer());

    const isPdf = upstreamType.includes('pdf') ||
      (material.file_name && material.file_name.toLowerCase().endsWith('.pdf')) ||
      (buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46);

    if (!isPdf) {
      // Pass non-PDFs through unwatermarked; the modal will still display them via blob URL.
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': upstreamType || 'application/octet-stream',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const stamped = await watermarkPdf(buf, member.email);
    return new Response(stamped, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('doc-view error:', err);
    return errorResponse(500, err.message || 'Internal error');
  }
};

export const config = {
  path: '/api/doc-view',
};
