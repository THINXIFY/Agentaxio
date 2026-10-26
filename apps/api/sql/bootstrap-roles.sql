-- Run ONCE per PostgreSQL cluster by a superuser (or a role with CREATEROLE). Safe to re-run.
-- Roles are cluster-level and are NOT created by migrations, so migrations never need superuser rights and no
-- password ever lives in source control. After running this, an operator enables login with a generated password:
--   ALTER ROLE axo_migrator   LOGIN PASSWORD '<generated>';
--   ALTER ROLE axo_agent_api  LOGIN PASSWORD '<generated>';
--   ALTER ROLE axo_management LOGIN PASSWORD '<generated>';
--   ALTER ROLE axo_executor   LOGIN PASSWORD '<generated>';
--
--   axo_migrator    owns the schema and runs migrations. Never used by a running service.
--   axo_agent_api   serves agent traffic: may create and read an agent's own action requests, nothing else.
--   axo_management  serves the signed-in human API: sessions, organizations, agents, credentials, policies,
--                   approvals. Every statement is gated by the session user's membership role (see migrations/).
--   axo_executor    the trusted executor. Has NO table privileges; it can only call five database functions.
-- None is a superuser, may create roles or databases, or bypasses row-level security.

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['axo_migrator', 'axo_agent_api', 'axo_management', 'axo_executor'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
        r
      );
    END IF;
  END LOOP;
END
$$;
