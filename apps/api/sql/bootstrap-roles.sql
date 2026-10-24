-- Run ONCE per PostgreSQL cluster by a superuser (or a role with CREATEROLE). Safe to re-run.
-- Roles are cluster-level and are NOT created by migrations, so migrations never need superuser rights and no
-- password ever lives in source control. After running this, an operator enables login with a generated password:
--   ALTER ROLE axo_migrator   LOGIN PASSWORD '<generated>';
--   ALTER ROLE axo_agent_api  LOGIN PASSWORD '<generated>';
--   ALTER ROLE axo_management LOGIN PASSWORD '<generated>';
-- (axo_executor is added with M02.)
--
--   axo_migrator    owns the schema and runs migrations. Never used by a running service.
--   axo_agent_api   serves agent traffic: may create and read an agent's own action requests, nothing else.
--   axo_management  serves human-administered operations: agents, credentials, policies. Every statement is
--                   additionally gated by the caller's membership role (see migrations/).
-- None is a superuser, may create roles or databases, or bypasses row-level security.

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['axo_migrator', 'axo_agent_api', 'axo_management'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
        r
      );
    END IF;
  END LOOP;
END
$$;
