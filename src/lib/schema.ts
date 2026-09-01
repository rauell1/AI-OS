// Dialect-neutral DDL for Rauell OS.
//
// This schema runs unchanged on:
//   - local development: sql.js (SQLite/WASM, file at ./data/rauell.db)
//   - production:        Neon PostgreSQL via node-postgres (`pg`)
//
// Rules that keep it portable:
//   * All primary keys are TEXT (app-generated UUIDs), never SERIAL/AUTOINCREMENT.
//   * Booleans / flags are INTEGER 0|1.
//   * Dates and timestamps are ISO TEXT.
//   * JSON / JSONB are stored as TEXT and parsed in application code.
//   * Foreign keys and indexes are declared; they are enforced by both engines.
//   * __EMBEDDING_TYPE__ is substituted at bootstrap: vector(1536) when the
//     pgvector extension is available, TEXT otherwise (and always on SQLite).
//     See EMBEDDING_TYPE_TOKEN in db.ts.

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  headline TEXT,
  summary TEXT,
  location TEXT,
  nationality TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  resume_url TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS education (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  institution TEXT NOT NULL,
  degree TEXT,
  field TEXT,
  start_year INTEGER,
  end_year INTEGER,
  status TEXT,
  details_json TEXT DEFAULT '{}',
  verification TEXT DEFAULT 'user_provided',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employment (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT,
  title TEXT NOT NULL,
  role_category TEXT,
  start_date TEXT,
  end_date TEXT,
  current INTEGER DEFAULT 0,
  location TEXT,
  summary TEXT,
  responsibilities_json TEXT DEFAULT '[]',
  verification TEXT DEFAULT 'user_provided',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  proficiency TEXT,
  years REAL,
  last_used TEXT,
  confidence REAL DEFAULT 1.0,
  ai_summary TEXT,
  verification TEXT DEFAULT 'user_provided',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_evidence (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  status TEXT DEFAULT 'active',
  overview TEXT,
  goals_json TEXT DEFAULT '[]',
  decisions_json TEXT DEFAULT '[]',
  risks_json TEXT DEFAULT '[]',
  ai_summary TEXT,
  next_actions_json TEXT DEFAULT '[]',
  github_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  industry TEXT,
  location TEXT,
  website TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  organization_id TEXT,
  email TEXT,
  phone TEXT,
  relationship TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunity_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  credibility_score REAL DEFAULT 1.0,
  last_crawled_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  organization_id TEXT,
  source_url TEXT,
  source_name TEXT,
  description TEXT,
  raw_text TEXT,
  published_date TEXT,
  deadline TEXT,
  location TEXT,
  remote INTEGER DEFAULT 0,
  compensation TEXT,
  status TEXT DEFAULT 'discovered',
  structured_json TEXT DEFAULT '{}',
  evidence_json TEXT DEFAULT '[]',
  last_verified TEXT,
  fit_score_history_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunity_scores (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  model TEXT,
  overall REAL,
  dimensions_json TEXT DEFAULT '{}',
  explanation TEXT,
  recommendation TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  opportunity_id TEXT,
  title TEXT NOT NULL,
  organization_id TEXT,
  status TEXT DEFAULT 'discovered',
  deadline TEXT,
  fit_score REAL,
  ai_analysis_json TEXT DEFAULT '{}',
  timeline_json TEXT DEFAULT '[]',
  notes TEXT,
  interview_granted INTEGER DEFAULT 0,
  outcome TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_requirements (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  label TEXT NOT NULL,
  required INTEGER DEFAULT 1,
  satisfied INTEGER DEFAULT 0,
  evidence TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS application_questions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  question TEXT NOT NULL,
  canonical_answer TEXT,
  tailored_answer TEXT,
  approved INTEGER DEFAULT 0,
  source_evidence TEXT
);

CREATE TABLE IF NOT EXISTS application_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  role TEXT
);

CREATE TABLE IF NOT EXISTS application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS application_versions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  title TEXT,
  content TEXT,
  model TEXT,
  prompt_version TEXT,
  approved INTEGER DEFAULT 0,
  submitted INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT,
  source_id TEXT,
  project_id TEXT,
  opportunity_id TEXT,
  application_id TEXT,
  person_id TEXT,
  organization_id TEXT,
  due_date TEXT,
  priority INTEGER DEFAULT 3,
  status TEXT DEFAULT 'inbox',
  effort TEXT,
  ai_reasoning TEXT,
  completion_evidence TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  depends_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_id TEXT,
  thread_id TEXT,
  from_addr TEXT,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,
  body_text TEXT,
  received_at TEXT,
  category TEXT,
  confidence REAL,
  deadline TEXT,
  requested_action TEXT,
  sentiment TEXT,
  follow_up_date TEXT,
  project_id TEXT,
  opportunity_id TEXT,
  application_id TEXT,
  person_id TEXT,
  organization_id TEXT,
  status TEXT DEFAULT 'unprocessed',
  ai_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT,
  last_message_at TEXT,
  message_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  integration_id TEXT,
  title TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  location TEXT,
  attendees_json TEXT DEFAULT '[]',
  related_project TEXT,
  related_org TEXT,
  brief_json TEXT DEFAULT '{}',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  issuer TEXT,
  date TEXT,
  expiry TEXT,
  sensitivity TEXT DEFAULT 'normal',
  file_path TEXT,
  storage_provider TEXT DEFAULT 'local',
  hash TEXT,
  version INTEGER DEFAULT 1,
  size_bytes BIGINT,
  mime TEXT,
  applications_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS references_ (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  organization TEXT,
  relationship TEXT,
  email TEXT,
  phone TEXT,
  permission_status TEXT DEFAULT 'not_requested',
  letter_available INTEGER DEFAULT 0,
  last_contacted TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT,
  person_id TEXT,
  solution TEXT,
  observed_evidence TEXT,
  inference TEXT,
  hypothesis TEXT,
  confidence REAL,
  score REAL,
  status TEXT DEFAULT 'new',
  pipeline_value REAL,
  conversion_stage TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outreach (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lead_id TEXT,
  channel TEXT,
  status TEXT DEFAULT 'draft',
  draft TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS followups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  due_date TEXT,
  note TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  body TEXT,
  entity_type TEXT,
  entity_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  source_type TEXT,
  source_id TEXT,
  embedding_status TEXT DEFAULT 'none',
  embedding_vector __EMBEDDING_TYPE__,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'AI Assistant',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  used_ai INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_provider TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  extracted_text TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated ON chat_threads(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_attachments(message_id);

CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  agent TEXT,
  model TEXT,
  prompt_version TEXT,
  input_json TEXT DEFAULT '{}',
  output_json TEXT DEFAULT '{}',
  tokens INTEGER,
  cost REAL,
  status TEXT DEFAULT 'success',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  version TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  frequency TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  config_json TEXT DEFAULT '{}',
  last_run TEXT,
  next_run TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT DEFAULT 'running',
  result_json TEXT DEFAULT '{}',
  errors_json TEXT DEFAULT '[]',
  actions_created INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id TEXT,
  read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  why TEXT,
  affected_data_json TEXT DEFAULT '{}',
  ai_reasoning TEXT,
  preview TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  context TEXT,
  reason TEXT,
  related_json TEXT DEFAULT '[]',
  evidence_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT DEFAULT 'disconnected',
  permissions_json TEXT DEFAULT '{}',
  token_meta_json TEXT DEFAULT '{}',
  last_synced TEXT,
  config_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_tokens (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT DEFAULT 'running',
  result_json TEXT DEFAULT '{}',
  errors_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  meta_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  prefs_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  linked_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_education_user ON education(user_id);
CREATE INDEX IF NOT EXISTS idx_employment_user ON employment(user_id);
CREATE INDEX IF NOT EXISTS idx_employment_org ON employment(organization_id);
CREATE INDEX IF NOT EXISTS idx_skills_user ON skills(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_org_user ON organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_people_user ON people(user_id);
CREATE INDEX IF NOT EXISTS idx_people_org ON people(organization_id);
CREATE INDEX IF NOT EXISTS idx_opp_user ON opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_opp_type ON opportunities(type);
CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_app_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_app_opp ON applications(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_emails_user ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);
CREATE INDEX IF NOT EXISTS idx_docs_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_cal_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_cal_start ON calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_links_user ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_user ON automation_rules(user_id);

-- Failed sign-in attempts, for rate limiting. Written before anyone is
-- authenticated, so it carries no user_id and is reachable only in system
-- context. Only failures are recorded; a success clears the caller's history.
CREATE TABLE IF NOT EXISTS auth_attempts (
  id TEXT PRIMARY KEY,
  caller TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_caller ON auth_attempts(caller, attempted_at);
`;

export const MIGRATION_NAME = "0003_integrations_fix";
