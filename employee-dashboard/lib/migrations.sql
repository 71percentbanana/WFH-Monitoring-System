-- =====================================================
-- DATABASE MIGRATIONS - ROLE-AWARE TELESCOPE SYSTEM
-- =====================================================

-- 1. Create Roles Table with Hierarchy support
CREATE TABLE IF NOT EXISTS roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE,
  parent_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Role Rules Table for Dynamic Heuristics
CREATE TABLE IF NOT EXISTS role_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  rule_type VARCHAR NOT NULL CHECK (rule_type IN ('app', 'domain', 'window_title', 'sequence', 'keyword')),
  match_type VARCHAR NOT NULL CHECK (match_type IN ('exact', 'contains', 'regex')),
  pattern VARCHAR NOT NULL,
  score INTEGER NOT NULL,
  category VARCHAR NOT NULL CHECK (category IN ('Productive', 'Unproductive', 'Neutral', 'Idle')),
  confidence FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Employee Roles mapping
CREATE TABLE IF NOT EXISTS employee_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, role_id)
);

-- 4. Create Classifier Feedback for Audit Logs
CREATE TABLE IF NOT EXISTS classifier_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id INTEGER NOT NULL, -- references activity_logs.id
  admin_corrected_score INTEGER NOT NULL,
  admin_corrected_category VARCHAR NOT NULL CHECK (admin_corrected_category IN ('Productive', 'Unproductive', 'Neutral', 'Idle')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create Activity Sessions for High-Fidelity Analytics
CREATE TABLE IF NOT EXISTS activity_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  focus_score FLOAT NOT NULL,
  distraction_count INTEGER NOT NULL,
  app_switches INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- SEED DATA & HIERARCHIES
-- =====================================================

-- Seed Core Roles
INSERT INTO roles (id, name, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'knowledge_worker', 'Default role for general office tasks and coordination')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles (id, name, parent_role_id, description) VALUES
  ('22222222-2222-2222-2222-222222222222', 'software_engineer', '11111111-1111-1111-1111-111111111111', 'Technical role specializing in coding, design, and analysis')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles (id, name, parent_role_id, description) VALUES
  ('33333333-3333-3333-3333-333333333333', 'frontend_engineer', '22222222-2222-2222-2222-222222222222', 'UI engineering specialist, leverages design software and web interfaces'),
  ('44444444-4444-4444-4444-444444444444', 'recruiter', '11111111-1111-1111-1111-111111111111', 'Talent acquisition, heavy social platforming and outreach'),
  ('55555555-5555-5555-5555-555555555555', 'designer', '11111111-1111-1111-1111-111111111111', 'Visual and UI designer, leverages figma and modeling resources')
ON CONFLICT (name) DO NOTHING;

-- Seed Rules
-- Knowledge Worker default rules
INSERT INTO role_rules (role_id, rule_type, match_type, pattern, score, category) VALUES
  ('11111111-1111-1111-1111-111111111111', 'domain', 'exact', 'slack.com', 7, 'Productive'),
  ('11111111-1111-1111-1111-111111111111', 'domain', 'exact', 'notion.so', 8, 'Productive'),
  ('11111111-1111-1111-1111-111111111111', 'domain', 'exact', 'youtube.com', -10, 'Unproductive'),
  ('11111111-1111-1111-1111-111111111111', 'app', 'exact', 'explorer.exe', 2, 'Neutral')
ON CONFLICT DO NOTHING;

-- Software Engineer inherits above and adds coding rules
INSERT INTO role_rules (role_id, rule_type, match_type, pattern, score, category) VALUES
  ('22222222-2222-2222-2222-222222222222', 'app', 'contains', 'code', 10, 'Productive'),
  ('22222222-2222-2222-2222-222222222222', 'app', 'contains', 'pycharm', 10, 'Productive'),
  ('22222222-2222-2222-2222-222222222222', 'domain', 'contains', 'github', 10, 'Productive'),
  ('22222222-2222-2222-2222-222222222222', 'domain', 'exact', 'stackoverflow.com', 9, 'Productive'),
  ('22222222-2222-2222-2222-222222222222', 'domain', 'contains', 'localhost', 8, 'Productive')
ON CONFLICT DO NOTHING;

-- Frontend Engineer inherits Software Engineer and adds UI rules
INSERT INTO role_rules (role_id, rule_type, match_type, pattern, score, category) VALUES
  ('33333333-3333-3333-3333-333333333333', 'domain', 'exact', 'react.dev', 10, 'Productive'),
  ('33333333-3333-3333-3333-333333333333', 'app', 'exact', 'figma.exe', 8, 'Productive'),
  ('33333333-3333-3333-3333-333333333333', 'domain', 'exact', 'figma.com', 8, 'Productive')
ON CONFLICT DO NOTHING;

-- Recruiter has custom rules where LinkedIn/outreach is productive
INSERT INTO role_rules (role_id, rule_type, match_type, pattern, score, category) VALUES
  ('44444444-4444-4444-4444-444444444444', 'domain', 'contains', 'linkedin.com', 10, 'Productive'),
  ('44444444-4444-4444-4444-444444444444', 'domain', 'contains', 'recruit', 10, 'Productive')
ON CONFLICT DO NOTHING;

-- Designer rules
INSERT INTO role_rules (role_id, rule_type, match_type, pattern, score, category) VALUES
  ('55555555-5555-5555-5555-555555555555', 'app', 'exact', 'figma.exe', 10, 'Productive'),
  ('55555555-5555-5555-5555-555555555555', 'domain', 'contains', 'behance.net', 9, 'Productive'),
  ('55555555-5555-5555-5555-555555555555', 'domain', 'contains', 'dribbble.com', 9, 'Productive')
ON CONFLICT DO NOTHING;
