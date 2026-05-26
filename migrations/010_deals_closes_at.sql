-- 010_deals_closes_at.sql
-- Club-specific reservation deadline for deals. Independent of supabase2's
-- deals.deadline_at (which is synced from Andy's spreadsheet's "Reservation
-- Period End Date"). When set and past, the deal auto-archives to the Past
-- tab on the member side without touching supabase2.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;
