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
COMMIT;
