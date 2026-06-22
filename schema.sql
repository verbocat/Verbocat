-- Add segment-wise context columns to document_segments table
ALTER TABLE document_segments ADD COLUMN IF NOT EXISTS context_jira TEXT;
ALTER TABLE document_segments ADD COLUMN IF NOT EXISTS context_description TEXT;
