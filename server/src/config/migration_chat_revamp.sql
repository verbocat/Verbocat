-- Alter chat_messages to add support for edits, pins, and threading
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS thread_parent_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE;

-- Create chat_message_reactions table
CREATE TABLE IF NOT EXISTS chat_message_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

-- Alter profiles to add last_seen_at
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- Enable RLS and create policy for reactions table
ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "chat_message_reactions_all" ON chat_message_reactions FOR ALL USING (true) WITH CHECK (true);

-- Indexing for speed
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_parent_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_message_reactions(message_id);
