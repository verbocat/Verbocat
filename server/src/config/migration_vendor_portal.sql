-- ====================================================================
-- Migration: Vendor Portal Linguist Management
-- Description: Creates tables for storing linguist profiles, language pairs, and audit history.
-- Compatible with Supabase PostgreSQL.
-- ====================================================================

-- 1. Create linguist_profiles table
CREATE TABLE IF NOT EXISTS public.linguist_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    whatsapp TEXT,
    country TEXT,
    city TEXT,
    timezone TEXT,
    primary_language TEXT,
    secondary_languages TEXT[],
    years_of_experience INTEGER,
    areas_of_expertise TEXT[],
    translation_rate_per_word NUMERIC(10,4),
    video_subtitle_rate_per_minute NUMERIC(10,4),
    proofreading_rate NUMERIC(10,4),
    mtpe_rate NUMERIC(10,4),
    currency TEXT DEFAULT 'INR',
    cat_tools TEXT[],
    subtitle_tools TEXT[],
    previous_experience TEXT,
    certifications TEXT,
    cv_url TEXT,
    portfolio_url TEXT,
    availability TEXT,
    additional_info TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review',
    vendor_notes TEXT,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create linguist_language_pairs table
CREATE TABLE IF NOT EXISTS public.linguist_language_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    linguist_profile_id UUID NOT NULL REFERENCES public.linguist_profiles(id) ON DELETE CASCADE,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    proficiency TEXT DEFAULT 'professional',
    status TEXT NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(linguist_profile_id, source_language, target_language)
);

-- 3. Create linguist_profile_history table
CREATE TABLE IF NOT EXISTS public.linguist_profile_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    linguist_profile_id UUID NOT NULL REFERENCES public.linguist_profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS idx_linguist_profiles_email ON public.linguist_profiles(email);
CREATE INDEX IF NOT EXISTS idx_linguist_profiles_status ON public.linguist_profiles(status);
CREATE INDEX IF NOT EXISTS idx_linguist_profiles_org_id ON public.linguist_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_linguist_profiles_user_id ON public.linguist_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_linguist_pairs_profile_id ON public.linguist_language_pairs(linguist_profile_id);
CREATE INDEX IF NOT EXISTS idx_linguist_pairs_status ON public.linguist_language_pairs(status);

CREATE INDEX IF NOT EXISTS idx_linguist_history_profile_id ON public.linguist_profile_history(linguist_profile_id);
CREATE INDEX IF NOT EXISTS idx_linguist_history_created_at ON public.linguist_profile_history(created_at DESC);

-- 5. Row Level Security & Policies (Clean DDL without DO $$ blocks)
ALTER TABLE public.linguist_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linguist_language_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linguist_profile_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on linguist_profiles" ON public.linguist_profiles;
CREATE POLICY "Service role full access on linguist_profiles"
  ON public.linguist_profiles FOR ALL
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on linguist_language_pairs" ON public.linguist_language_pairs;
CREATE POLICY "Service role full access on linguist_language_pairs"
  ON public.linguist_language_pairs FOR ALL
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on linguist_profile_history" ON public.linguist_profile_history;
CREATE POLICY "Service role full access on linguist_profile_history"
  ON public.linguist_profile_history FOR ALL
  USING (true) WITH CHECK (true);

-- 6. Backfill existing registered linguists into linguist_profiles
INSERT INTO public.linguist_profiles (user_id, full_name, email, status, created_at, updated_at)
SELECT 
    p.id AS user_id,
    p.email AS full_name,
    p.email AS email,
    'pending_review' AS status,
    NOW() AS created_at,
    NOW() AS updated_at
FROM public.profiles p
WHERE p.role = 'linguist'
  AND NOT EXISTS (
      SELECT 1 FROM public.linguist_profiles lp WHERE lp.email = p.email OR lp.user_id = p.id
  )
ON CONFLICT (email) DO NOTHING;

-- 7. Add initial history log for backfilled linguists
INSERT INTO public.linguist_profile_history (linguist_profile_id, action, details, created_at)
SELECT 
    lp.id,
    'profile_submitted',
    'Existing linguist profile imported for vendor review',
    NOW()
FROM public.linguist_profiles lp
WHERE NOT EXISTS (
    SELECT 1 FROM public.linguist_profile_history lph WHERE lph.linguist_profile_id = lp.id
);
