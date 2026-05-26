-- Add source_deal_id column to link local deals to supabase2 deal room deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_deal_id uuid;
CREATE INDEX IF NOT EXISTS idx_deals_source_deal_id ON deals(source_deal_id);
