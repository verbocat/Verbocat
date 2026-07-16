CREATE TABLE IF NOT EXISTS segment_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES segment_comments(id) ON DELETE CASCADE,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Performance index
CREATE INDEX IF NOT EXISTS idx_segment_comments_doc_seg ON segment_comments(document_id, segment_index);

-- RLS
ALTER TABLE segment_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segment_comments_all" ON segment_comments FOR ALL USING (true) WITH CHECK (true);
