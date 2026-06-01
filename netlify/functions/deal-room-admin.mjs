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

async function findOrCreateSb2UserByEmail(sb2, email, fullName) {
  const { data: existing } = await sb2
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) return existing.id;

  const parts = (fullName || '').trim().split(/\s+/);
  const { data: created, error } = await sb2
    .from('users')
    .insert([{ email, first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '' }])
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create SB2 user: ${error.message}`);
  return created.id;
}

async function authenticateAdmin(sb1, device_id) {
  if (!device_id) return { error: 'Missing device_id' };

  const { data: session } = await sb1
    .from('admin_sessions')
    .select('id')
    .eq('device_id', device_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!session) return { error: 'Not authorized' };
  return { ok: true };
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = await req.json();
    const { device_id, action } = body;

    const sb1 = getSb1();
    const auth = await authenticateAdmin(sb1, device_id);
    if (auth.error) return json(401, { error: auth.error });

    const sb2 = getSb2();

    if (action === 'listSourceDeals') {
      const { data, error } = await sb2
        .from('deals')
        .select('id, name, company_name, company_url, headline, deck_url, deal_status, stage, created_at, deadline_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return json(200, { deals: data || [] });
    }

    if (action === 'getDealDetail') {
      const { sourceDealId } = body;
      if (!sourceDealId) return json(400, { error: 'Missing sourceDealId' });

      const [dealRes, termsRes] = await Promise.all([
        sb2.from('deals').select('description, deadline_at').eq('id', sourceDealId).maybeSingle(),
        sb2.from('dr_deal_terms').select('*').eq('deal_id', sourceDealId).maybeSingle(),
      ]);

      let terms = termsRes.data || null;
      if (terms?.company_image_path && !/^https?:\/\//i.test(terms.company_image_path)) {
        const { data: signed, error: signErr } = await sb2.storage
          .from('deal-materials')
          .createSignedUrl(terms.company_image_path, 3600);
        if (signErr) {
          console.warn(`Failed to sign company image for deal ${sourceDealId} (path=${terms.company_image_path}):`, signErr.message);
          terms = { ...terms, company_image_path: null };
        } else {
          terms = { ...terms, company_image_path: signed?.signedUrl || null };
        }
      }

      return json(200, {
        description: dealRes.data?.description || null,
        deadline_at: dealRes.data?.deadline_at || null,
        terms,
      });
    }

    if (action === 'getDealMaterials') {
      const { sourceDealId } = body;
      if (!sourceDealId) return json(400, { error: 'Missing sourceDealId' });

      const { data: materials, error } = await sb2
        .from('deal_materials')
        .select('*')
        .eq('deal_id', sourceDealId)
        .order('sort_order', { ascending: true });
      if (error) throw error;

      const withUrls = await Promise.all(
        (materials || []).map(async (m) => {
          if (m.storage_path) {
            const { data: signed } = await sb2.storage
              .from('deal-materials')
              .createSignedUrl(m.storage_path, 3600);
            return { ...m, signed_url: signed?.signedUrl || null };
          }
          return { ...m, signed_url: m.url || null };
        })
      );

      return json(200, { materials: withUrls });
    }

    if (action === 'incrementReminder') {
      const { responseId } = body;
      if (!responseId) return json(400, { error: 'Missing responseId' });

      const { data: current, error: readErr } = await sb2
        .from('dr_responses')
        .select('reminders_sent')
        .eq('id', responseId)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!current) return json(404, { error: 'Response not found' });

      const next = (current.reminders_sent || 0) + 1;
      const { error: updErr } = await sb2
        .from('dr_responses')
        .update({ reminders_sent: next })
        .eq('id', responseId);
      if (updErr) throw updErr;
      return json(200, { reminders_sent: next });
    }

    if (action === 'updateResponse') {
      const { responseId, decision, desiredAmount } = body;
      if (!responseId) return json(400, { error: 'Missing responseId' });
      if (decision !== 'invest' && decision !== 'pass') {
        return json(400, { error: 'Invalid decision' });
      }
      // pass = no amount; invest can have a numeric amount or null (Max)
      const amount = decision === 'pass' ? null : (desiredAmount ?? null);
      const { error: updErr } = await sb2
        .from('dr_responses')
        .update({
          decision,
          desired_amount: amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', responseId);
      if (updErr) throw updErr;
      return json(200, { success: true });
    }

    if (action === 'upsertResponseForMember') {
      // Admin recording a response on behalf of a member who hasn't submitted
      // one themselves yet (or replacing an existing one). Auto-creates the
      // SB2 user if missing so members who've never logged into the deal room
      // can still have their decision logged.
      const { sourceDealId, email, fullName, decision, desiredAmount } = body;
      if (!sourceDealId || !email) return json(400, { error: 'Missing sourceDealId or email' });
      if (decision !== 'invest' && decision !== 'pass') {
        return json(400, { error: 'Invalid decision' });
      }
      const cleanEmail = String(email).toLowerCase().trim();
      const userId = await findOrCreateSb2UserByEmail(sb2, cleanEmail, fullName);

      const { data: existing } = await sb2
        .from('dr_responses')
        .select('id, submitted_at')
        .eq('deal_id', sourceDealId)
        .eq('user_id', userId)
        .maybeSingle();

      const amount = decision === 'pass' ? null : (desiredAmount ?? null);
      const now = new Date().toISOString();

      if (existing) {
        const patch = { decision, desired_amount: amount, updated_at: now };
        if (!existing.submitted_at) patch.submitted_at = now;
        const { error } = await sb2.from('dr_responses').update(patch).eq('id', existing.id);
        if (error) throw error;
        return json(200, { success: true, id: existing.id, updated: true });
      }

      const { data: inserted, error } = await sb2
        .from('dr_responses')
        .insert([{
          deal_id: sourceDealId,
          user_id: userId,
          decision,
          desired_amount: amount,
          submitted_at: now,
          reminders_sent: 0,
        }])
        .select('id')
        .single();
      if (error) throw error;
      return json(200, { success: true, id: inserted.id, updated: false });
    }

    if (action === 'listAllResponsesAndUsers') {
      const [respRes, usersRes] = await Promise.all([
        sb2.from('dr_responses').select('*').not('user_id', 'is', null),
        sb2.from('users').select('id, email, first_name, last_name'),
      ]);

      if (respRes.error) throw respRes.error;
      if (usersRes.error) throw usersRes.error;

      return json(200, {
        responses: respRes.data || [],
        users: usersRes.data || [],
      });
    }

    return json(400, { error: 'Unknown action' });
  } catch (err) {
    console.error('deal-room-admin error:', err);
    return json(500, { error: err.message || 'Internal error' });
  }
};

export const config = {
  path: '/api/deal-room-admin',
};
