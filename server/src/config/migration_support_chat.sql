-- Create support_queries table
CREATE TABLE IF NOT EXISTS support_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    linguist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    query_type TEXT NOT NULL CHECK (query_type IN ('segment', 'file')),
    segment_index INTEGER, -- Null if query_type is 'file'
    topic TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create support_messages table
CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id UUID NOT NULL REFERENCES support_queries(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    attachment_url TEXT,
    attachment_name TEXT,
    attachment_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Performance and query lookup indexes
CREATE INDEX IF NOT EXISTS idx_support_queries_document ON support_queries(document_id);
CREATE INDEX IF NOT EXISTS idx_support_queries_linguist ON support_queries(linguist_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_query_created ON support_messages(query_id, created_at ASC);

-- Enable Row Level Security (RLS)
ALTER TABLE support_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Allow full API-mediated access
CREATE POLICY "support_queries_all" ON support_queries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "support_messages_all" ON support_messages FOR ALL USING (true) WITH CHECK (true);
