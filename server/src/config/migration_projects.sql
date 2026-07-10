-- 1. Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client TEXT,
  description TEXT,
  source_lang TEXT NOT NULL DEFAULT 'en',
  target_languages TEXT[] NOT NULL DEFAULT '{}',
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Alter documents table to add project_id, word_count, file_size, status
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- 3. Create translation_jobs table
CREATE TABLE IF NOT EXISTS translation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  target_lang TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'paused', 'cancelled'
  progress INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  mqm_score NUMERIC DEFAULT 100,
  ai_score NUMERIC DEFAULT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(document_id, target_lang)
);

-- 4. Alter document_segments table to add target_lang
ALTER TABLE document_segments ADD COLUMN IF NOT EXISTS target_lang TEXT;

-- 5. Backfill existing segments with the document's target language
UPDATE document_segments
SET target_lang = documents.target_lang
FROM documents
WHERE document_segments.document_id = documents.id
  AND document_segments.target_lang IS NULL;

-- 6. Dynamically drop old constraints on document_segments that restrict (document_id, segment_index)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT DISTINCT tc.constraint_name 
        FROM information_schema.table_constraints tc 
        JOIN information_schema.constraint_column_usage ccu 
          ON tc.constraint_name = ccu.constraint_name 
        WHERE tc.table_name = 'document_segments' 
          AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
          AND ccu.column_name = 'segment_index'
    ) LOOP
        EXECUTE 'ALTER TABLE document_segments DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ' CASCADE';
    END LOOP;
END $$;

-- 7. Add composite unique constraint for multi-language support (document_id, target_lang, segment_index)
ALTER TABLE document_segments ADD CONSTRAINT document_segments_doc_lang_seg_idx_key UNIQUE (document_id, target_lang, segment_index);
