-- Run once per database, as a superuser or the database owner, BEFORE the migrations. Safe to re-run.
-- PostgreSQL grants CONNECT and TEMP on every new database to PUBLIC; take that away and grant back only what the
-- three AgentAxio roles need. (Roles themselves come from bootstrap-roles.sql.)

DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO axo_migrator, axo_agent_api, axo_management', current_database());
  -- Nobody but the owner creates objects in the public schema, and the runtime roles never touch it.
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
END
$$;
