-- Storage RLS to match private buckets.
--
-- Context: profile-photos and content-files were flipped from public to
-- private. Reads now go through the /api/storage-redirect Netlify function
-- using the service role key, so no client-side SELECT policy is needed.
-- Writes still happen from the browser using the anon key (the app uses a
-- custom member_sessions table, not Supabase Auth), so INSERT/UPDATE must be
-- granted to anon to keep the existing upload flows working.
--
-- The old policies from migration 005 targeted the `authenticated` role,
-- which never matched the anon client. Drop them and replace with anon
-- policies. content-files had no migration — its old Dashboard policies
-- (if any) are also superseded here.

-- Make sure both buckets are flagged private.
UPDATE storage.buckets SET public = false WHERE id IN ('profile-photos', 'content-files');

-- Ensure the buckets exist (idempotent).
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('content-files', 'content-files', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Drop the legacy policies from migration 005.
DROP POLICY IF EXISTS "Public read profile photos"            ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload profile photos"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update profile photos"   ON storage.objects;

-- Also drop the new names in case this migration is re-run.
DROP POLICY IF EXISTS "anon upload profile photos"   ON storage.objects;
DROP POLICY IF EXISTS "anon update profile photos"   ON storage.objects;
DROP POLICY IF EXISTS "anon upload content files"    ON storage.objects;
DROP POLICY IF EXISTS "anon update content files"    ON storage.objects;

-- profile-photos: anon may insert and update objects in this bucket.
CREATE POLICY "anon upload profile photos"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'profile-photos');

CREATE POLICY "anon update profile photos"
ON storage.objects
FOR UPDATE
TO anon
USING (bucket_id = 'profile-photos')
WITH CHECK (bucket_id = 'profile-photos');

-- content-files: anon may insert and update objects in this bucket.
CREATE POLICY "anon upload content files"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'content-files');

CREATE POLICY "anon update content files"
ON storage.objects
FOR UPDATE
TO anon
USING (bucket_id = 'content-files')
WITH CHECK (bucket_id = 'content-files');

-- Note: no SELECT policy. Reads only happen server-side through the
-- service-role client in /api/storage-redirect, which bypasses RLS.
