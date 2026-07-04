-- Migration to add Public Access support

-- Alter documents table to add public_access column
ALTER TABLE documents ADD COLUMN IF NOT EXISTS public_access TEXT DEFAULT 'none';
