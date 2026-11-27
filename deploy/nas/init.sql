-- Run inside harness_eval as its administrator. Set the login password separately.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'harness_app') THEN
    CREATE ROLE harness_app LOGIN;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.harness_workspace (
  id integer PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT CONNECT ON DATABASE harness_eval TO harness_app;
GRANT USAGE ON SCHEMA public TO harness_app;
GRANT SELECT, INSERT, UPDATE ON public.harness_workspace TO harness_app;
-- Enterprise tenants are provisioned independently of the original private workspace.
CREATE TABLE IF NOT EXISTS public.eval_tenant (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  active boolean NOT NULL DEFAULT true,
  workspace_digest text NOT NULL UNIQUE,
  data jsonb NOT NULL DEFAULT '{"projects":[{"id":"default","name":"默认项目","rows":[]}],"active":"default"}',
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.eval_ingest_key (
  tenant_id uuid NOT NULL REFERENCES public.eval_tenant(id),
  project_id text NOT NULL,
  key_digest text UNIQUE NOT NULL,
  PRIMARY KEY (tenant_id, project_id)
);
GRANT SELECT, INSERT, UPDATE ON public.eval_tenant, public.eval_ingest_key TO harness_app;
-- Tenant accounts are separate from project backups and workspace JSON.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE TABLE IF NOT EXISTS public.eval_member (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.eval_tenant(id),
  username text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','editor','viewer')),
  active boolean NOT NULL DEFAULT true,
  password_hash text NOT NULL,
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  UNIQUE (tenant_id, username)
);
CREATE TABLE IF NOT EXISTS public.eval_member_session (
  token_digest text PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.eval_member(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS eval_member_session_member ON public.eval_member_session(member_id);
GRANT SELECT, INSERT, UPDATE ON public.eval_member TO harness_app;
GRANT SELECT, INSERT, DELETE ON public.eval_member_session TO harness_app;
COMMIT;
