-- Migration to add Track Changes support

-- 1. Alter documents table to add track_changes_enabled column
ALTER TABLE documents ADD COLUMN IF NOT EXISTS track_changes_enabled BOOLEAN DEFAULT FALSE;

-- 2. Alter document_segments table to add original_target_text and tracked_by columns
ALTER TABLE document_segments ADD COLUMN IF NOT EXISTS original_target_text TEXT;
ALTER TABLE document_segments ADD COLUMN IF NOT EXISTS tracked_by TEXT;
