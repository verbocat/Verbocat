-- Migration to add project status and activity log table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

CREATE TABLE IF NOT EXISTS project_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'file_uploaded', 'translation_started', 'translation_completed', 'file_downloaded', 'context_updated', 'glossary_modified'
  details JSONB NOT NULL DEFAULT '{}',
  user_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_project_activities_project_id ON project_activities(project_id);
