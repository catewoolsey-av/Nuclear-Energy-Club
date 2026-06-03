import { createClient } from '@supabase/supabase-js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

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

async function authenticate(sb1, device_id) {
  if (!device_id) return { error: 'Missing device_id' };

  const { data: session } = await sb1
    .from('member_sessions')
    .select('member_id')
    .eq('device_id', device_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!session) return { error: 'Not authenticated' };

  const { data: member } = await sb1
    .from('members')
    .select('id, email, full_name')
    .eq('id', session.member_id)
    .maybeSingle();

  if (!member || !member.email) return { error: 'Member not found' };

  return { member };
}

async function findOrCreateSb2User(sb2, member) {
  const email = member.email.toLowerCase().trim();

  const { data: existing } = await sb2
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) return existing.id;

  const nameParts = (member.full_name || '').split(' ');
  const { data: created, error } = await sb2
    .from('users')
    .insert([{
      email,
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create user: ${error.message}`);
  return created.id;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = await req.json();
    const { device_id, action, clubSlug } = body;

    const sb1 = getSb1();
    const auth = await authenticate(sb1, device_id);
    if (auth.error) return json(401, { error: auth.error });

    const { member } = auth;
    const sb2 = getSb2();

    // Resolve club_id once per request. dr_responses are now scoped to a club
    // so a member's decision in one portal doesn't bleed into another.
    const clubId = await (async () => {
      if (!clubSlug) return null;
      const { data } = await sb2.from('clubs').select('id').eq('slug', clubSlug).maybeSingle();
      return data?.id || null;
    })();

    if (action === 'getMyResponses') {
      const userId = await (async () => {
        const { data } = await sb2
          .from('users')
          .select('id')
          .eq('email', member.email.toLowerCase().trim())
          .maybeSingle();
        return data?.id || null;
      })();

      if (!userId) return json(200, { responses: [] });

      let q = sb2
        .from('dr_responses')
        .select('id, deal_id, decision, desired_amount, submitted_at, created_at, club_id')
        .eq('user_id', userId)
        .not('user_id', 'is', null);
      if (clubId) q = q.eq('club_id', clubId);
      const { data: responses, error } = await q;

      if (error) throw error;
      return json(200, { responses: responses || [] });
    }

    if (action === 'getDealsInfo') {
      const { sourceDealIds } = body;
      if (!Array.isArray(sourceDealIds) || sourceDealIds.length === 0) {
        return json(200, { byId: {} });
      }

      const [dealsRes, termsRes, materialsRes] = await Promise.all([
        sb2.from('deals').select('id, description, deadline_at').in('id', sourceDealIds),
        sb2.from('dr_deal_terms').select('*').in('deal_id', sourceDealIds),
        sb2.from('deal_materials').select('*').in('deal_id', sourceDealIds).eq('is_archived', false).order('sort_order', { ascending: true }),
      ]);

      if (dealsRes.error) throw dealsRes.error;
      if (termsRes.error) throw termsRes.error;
      if (materialsRes.error) throw materialsRes.error;

      // dr_deal_terms.company_image_path stores a path inside the deal-materials bucket
      const termsWithImageUrls = await Promise.all(
        (termsRes.data || []).map(async (t) => {
          if (!t.company_image_path) return t;
          if (/^https?:\/\//i.test(t.company_image_path)) return t;
          const { data: signed, error } = await sb2.storage
            .from('deal-materials')
            .createSignedUrl(t.company_image_path, 3600);
          if (error) {
            console.warn(`Failed to sign company image for deal ${t.deal_id} (path=${t.company_image_path}):`, error.message);
            return { ...t, company_image_path: null };
          }
          return { ...t, company_image_path: signed?.signedUrl || null };
        })
      );

      const materialsWithUrls = await Promise.all(
        (materialsRes.data || []).map(async (m) => {
          if (m.storage_path) {
            const { data: signed } = await sb2.storage
              .from('deal-materials')
              .createSignedUrl(m.storage_path, 3600);
            return { ...m, signed_url: signed?.signedUrl || null };
          }
          return { ...m, signed_url: m.url || null };
        })
      );

      const byId = {};
      sourceDealIds.forEach(id => {
        byId[id] = { description: null, deadline_at: null, terms: null, materials: [] };
      });
      (dealsRes.data || []).forEach(d => {
        if (byId[d.id]) {
          byId[d.id].description = d.description || null;
          byId[d.id].deadline_at = d.deadline_at || null;
        }
      });
      termsWithImageUrls.forEach(t => {
        if (byId[t.deal_id]) byId[t.deal_id].terms = t;
      });
      materialsWithUrls.forEach(m => {
        if (byId[m.deal_id]) byId[m.deal_id].materials.push(m);
      });

      return json(200, { byId });
    }

    if (action === 'submitResponse') {
      const { sourceDealId, decision, desiredAmount, reason } = body;

      if (!sourceDealId) return json(400, { error: 'Missing sourceDealId' });
      if (decision !== 'invest' && decision !== 'pass') {
        return json(400, { error: 'Invalid decision' });
      }
      if (!clubId) return json(400, { error: 'Missing or invalid clubSlug' });

      const userId = await findOrCreateSb2User(sb2, member);

      // Existing row lookup is scoped by club so the same user can have an
      // independent response per club.
      const { data: existing } = await sb2
        .from('dr_responses')
        .select('id')
        .eq('user_id', userId)
        .eq('deal_id', sourceDealId)
        .eq('club_id', clubId)
        .maybeSingle();

      const now = new Date().toISOString();

      if (existing) {
        const { error } = await sb2
          .from('dr_responses')
          .update({
            decision,
            desired_amount: desiredAmount ?? null,
            reason: reason ?? null,
            submitted_at: now,
            updated_at: now,
          })
          .eq('id', existing.id);
        if (error) throw error;
        return json(200, { success: true, id: existing.id, updated: true });
      }

      const { data: inserted, error } = await sb2
        .from('dr_responses')
        .insert([{
          deal_id: sourceDealId,
          user_id: userId,
          club_id: clubId,
          decision,
          desired_amount: desiredAmount ?? null,
          reason: reason ?? null,
          submitted_at: now,
          reminders_sent: 0,
        }])
        .select('id')
        .single();
      if (error) throw error;
      return json(200, { success: true, id: inserted.id, updated: false });
    }

    return json(400, { error: 'Unknown action' });
  } catch (err) {
    console.error('deal-room-member error:', err);
    return json(500, { error: err.message || 'Internal error' });
  }
};

export const config = {
  path: '/api/deal-room-member',
};
