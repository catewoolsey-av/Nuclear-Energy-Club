-- 009_deals_disclosure.sql
-- Track when a member has accepted the deals-section disclosure.
-- Updated each time they accept (typically once per login session).

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS deals_disclosure_accepted_at TIMESTAMPTZ;
