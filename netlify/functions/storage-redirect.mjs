import { createClient } from '@supabase/supabase-js';

// Issues a 302 to a freshly-signed Supabase Storage URL for the requested
// (bucket, path). Used as the <img src> / window.open target for private
// buckets, so the client never sees a long-lived URL and the file bytes never
// flow through the function.
//
// Allowed buckets are whitelisted to avoid being abused as a generic signing
// oracle for any bucket the service role can read.

const ALLOWED_BUCKETS = new Set(['profile-photos', 'content-files']);
const SIGN_TTL_SECONDS = 3600; // 1 hour
const BROWSER_CACHE_SECONDS = 300; // 5 min — short enough that we re-sign before TTL expires

export default async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const bucket = url.searchParams.get('bucket');
  const path = url.searchParams.get('path');

  if (!bucket || !path) return new Response('Missing params', { status: 400 });
  if (!ALLOWED_BUCKETS.has(bucket)) return new Response('Forbidden bucket', { status: 403 });

  const sb = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, SIGN_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      'Cache-Control': `private, max-age=${BROWSER_CACHE_SECONDS}`,
    },
  });
};

export const config = {
  path: '/api/storage-redirect',
};
