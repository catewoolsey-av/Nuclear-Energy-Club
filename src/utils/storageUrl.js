// Resolve any stored photo/content value to a URL that the browser can load,
// given that the underlying Supabase buckets are now private.
//
// Accepts three input shapes:
//   1. Empty / null                                        → ''
//   2. External URL (LinkedIn CDN, http(s)://other.host)   → passthrough
//   3. Our Supabase public URL (legacy DB rows)            → /api/storage-redirect?... (extracts bucket+path)
//   4. Bare storage path inside `defaultBucket`            → /api/storage-redirect?bucket=<defaultBucket>&path=<value>
//
// The redirect endpoint signs the URL server-side and 302s the browser to it.
export function resolveStorageUrl(value, defaultBucket) {
  if (!value) return '';

  // Legacy public URL: /storage/v1/object/public/<bucket>/<path>
  const publicMatch = value.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
  if (publicMatch) {
    const bucket = publicMatch[1];
    const path = publicMatch[2];
    return `/api/storage-redirect?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`;
  }

  // Any other absolute URL — external host (LinkedIn, etc.) — leave alone.
  if (/^https?:\/\//i.test(value)) return value;

  // Treat as a bare path within the default bucket.
  if (!defaultBucket) return value;
  return `/api/storage-redirect?bucket=${encodeURIComponent(defaultBucket)}&path=${encodeURIComponent(value)}`;
}
