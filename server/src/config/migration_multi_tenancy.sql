-- 1. Create organizations table for multi-tenant spaces
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  credits_allowed INTEGER DEFAULT 100000,
  credits_consumed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index for quick subdomain lookup
CREATE INDEX IF NOT EXISTS idx_organizations_subdomain ON organizations(subdomain);

-- 2. Insert default Organization for VerboLabs / Centroid
INSERT INTO organizations (name, subdomain, credits_allowed, status)
VALUES ('VerboLabs', 'centroid', 10000000, 'active')
ON CONFLICT (subdomain) DO NOTHING;

-- 3. Add organization_id foreign key to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);

-- 4. Add organization_id foreign key to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);

-- 5. Add organization_id foreign key to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON documents(organization_id);

-- 6. Add organization_id foreign key to translation_memory
ALTER TABLE translation_memory ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_translation_memory_organization_id ON translation_memory(organization_id);

-- 7. Add organization_id foreign key to credit_logs and activity_logs
ALTER TABLE credit_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_credit_logs_organization_id ON credit_logs(organization_id);

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_activity_logs_organization_id ON activity_logs(organization_id);

-- 8. Backfill existing records to default VerboLabs organization
DO $$
DECLARE
    default_org_id UUID;
BEGIN
    SELECT id INTO default_org_id FROM organizations WHERE subdomain IN ('centroid', 'verbolabs') LIMIT 1;
    
    IF default_org_id IS NOT NULL THEN
        UPDATE profiles SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE projects SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE documents SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE translation_memory SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE credit_logs SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE activity_logs SET organization_id = default_org_id WHERE organization_id IS NULL;
    END IF;
END $$;
