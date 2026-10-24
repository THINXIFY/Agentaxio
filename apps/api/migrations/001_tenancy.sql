-- 001: schema hygiene, tenant-context helpers, organizations, users, memberships, environments.
-- Forward-only. Applied by axo_migrator (see src/db/migrate.ts). The axo schema exists already (runner prelude).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axo_agent_api')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axo_management') THEN
    RAISE EXCEPTION 'database roles are missing: run sql/bootstrap-roles.sql as a superuser first';
  END IF;
END
$$;

REVOKE ALL ON SCHEMA axo FROM PUBLIC;
GRANT USAGE ON SCHEMA axo TO axo_agent_api, axo_management;
-- PostgreSQL lets PUBLIC execute every new function unless told otherwise. This must be the database-wide default
-- (NOT "IN SCHEMA axo": a schema-scoped REVOKE cannot remove the built-in grant to PUBLIC). It applies to every
-- function this role creates from here on; migration 004 also sweeps all existing functions as a safety net.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------------------
-- Tenant context. Transaction-local settings that row-level security policies read. They are never set from request
-- input: axo.enter_agent_context / axo.enter_management_context derive them from database rows.
-- An unset or empty setting yields NULL, which matches no row: the default is "see nothing".
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION axo.current_org() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.organization_id', true), '')::uuid $$;
CREATE FUNCTION axo.current_agent() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.agent_id', true), '')::uuid $$;
CREATE FUNCTION axo.current_env() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.environment_id', true), '')::uuid $$;
CREATE FUNCTION axo.current_user_id() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION axo.current_org(), axo.current_agent(), axo.current_env(), axo.current_user_id()
  TO axo_agent_api, axo_management;

-- Rows that must never change after they are written (decisions, policy versions, audit) are protected by this
-- trigger in addition to having no UPDATE/DELETE grant. It also fires for the table owner.
CREATE FUNCTION axo.reject_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on axo.% is not allowed: the table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TABLE axo.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Not tenant-scoped: one person can belong to several organizations. The identity provider is undecided (Q3), so
-- the subject is stored as (issuer, subject) and the internal id is independent of it.
CREATE TABLE axo.users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_issuer  text NOT NULL CHECK (char_length(auth_issuer) BETWEEN 1 AND 255),
  auth_subject text NOT NULL CHECK (char_length(auth_subject) BETWEEN 1 AND 255),
  email        text CHECK (email IS NULL OR char_length(email) <= 254),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_issuer, auth_subject)
);

CREATE TABLE axo.memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES axo.organizations (id),
  user_id         uuid NOT NULL REFERENCES axo.users (id),
  role            text NOT NULL CHECK (role IN ('owner', 'admin', 'approver', 'viewer')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  UNIQUE (organization_id, id)
);

CREATE TABLE axo.environments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES axo.organizations (id),
  name              text NOT NULL CHECK (name ~ '^[a-z][a-z0-9-]{0,30}[a-z0-9]$'),
  enforcement_state text NOT NULL DEFAULT 'active' CHECK (enforcement_state IN ('active', 'halted')),
  -- Bumped (never lowered) in the same transaction as any policy change; recorded on every decision.
  policy_epoch      bigint NOT NULL DEFAULT 0 CHECK (policy_epoch >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name),
  UNIQUE (organization_id, id)
);

-- Membership-role checks, evaluated by the database for whichever user the trusted caller has asserted.
-- SECURITY DEFINER so it can read memberships without recursing through that table's own row-level security.
CREATE FUNCTION axo.has_role(p_org uuid, p_roles text[]) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM axo.memberships m
      WHERE m.organization_id = p_org
        AND m.user_id = axo.current_user_id()
        AND m.status = 'active'
        AND m.role = ANY (p_roles)
    )
  $$;
GRANT EXECUTE ON FUNCTION axo.has_role(uuid, text[]) TO axo_agent_api, axo_management;

-- The ONLY way a management transaction acquires a tenant: membership is proven here, in the database. The caller
-- supplies a user id that its own authentication layer has already verified (M01 has no human login; see
-- docs/BE-01-BACKEND.md) and the organization it wants to act in.
CREATE FUNCTION axo.enter_management_context(p_user uuid, p_org uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  v_role text;
BEGIN
  SELECT m.role INTO v_role FROM axo.memberships m
   WHERE m.organization_id = p_org AND m.user_id = p_user AND m.status = 'active';
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not an active member of the organization' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.user_id', p_user::text, true);
  PERFORM set_config('app.organization_id', p_org::text, true);
  PERFORM set_config('app.agent_id', '', true);
  PERFORM set_config('app.environment_id', '', true);
  RETURN v_role;
END
$$;
GRANT EXECUTE ON FUNCTION axo.enter_management_context(uuid, uuid) TO axo_management;

ALTER TABLE axo.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE axo.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE axo.memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE axo.environments  ENABLE ROW LEVEL SECURITY;

-- users: no runtime access at all (RLS enabled, no policy, no grant). Provisioning is done by the owner role.
GRANT SELECT ON axo.organizations, axo.memberships, axo.environments TO axo_management;
GRANT UPDATE (policy_epoch, enforcement_state) ON axo.environments TO axo_management;

CREATE POLICY organizations_read ON axo.organizations FOR SELECT TO axo_management
  USING (id = axo.current_org() AND axo.has_role(id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY memberships_read ON axo.memberships FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY environments_read ON axo.environments FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY environments_update ON axo.environments FOR UPDATE TO axo_management
  USING (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin']));

-- Environment state may only move forward in epoch, and nothing else about an environment may change.
CREATE FUNCTION axo.guard_environment_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.name <> OLD.name
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'environment identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.policy_epoch < OLD.policy_epoch THEN
    RAISE EXCEPTION 'policy_epoch cannot decrease' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER environments_guard BEFORE UPDATE ON axo.environments
  FOR EACH ROW EXECUTE FUNCTION axo.guard_environment_update();
