-- Migration script for API Keys management in Verbocat
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix VARCHAR(16) NOT NULL,
    name VARCHAR(255) DEFAULT 'Default API Key',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active'
);

-- Index for fast lookup by key_hash
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
-- Index for lookup by user_id
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
