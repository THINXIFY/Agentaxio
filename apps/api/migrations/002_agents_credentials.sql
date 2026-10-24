-- 002: agent identities and their credentials.
-- An agent belongs to exactly ONE environment (a physical agent used in dev and prod is two records). Credentials
-- inherit the environment through the agent, so a development key can never act in production (S03).

CREATE TABLE axo.agents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES axo.organizations (id),
  environment_id   uuid NOT NULL,
  owner_user_id    uuid NOT NULL,
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description      text CHECK (description IS NULL OR char_length(description) <= 500),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  created_by_user_id uuid NOT NULL REFERENCES axo.users (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  suspended_at     timestamptz,
  revoked_at       timestamptz,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, environment_id),
  UNIQUE (organization_id, environment_id, name),
  -- Composite foreign keys: a child row can never point at another organization's parent.
  FOREIGN KEY (organization_id, environment_id) REFERENCES axo.environments (organization_id, id),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES axo.memberships (organization_id, user_id),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CHECK ((status = 'suspended') = (suspended_at IS NOT NULL) OR status = 'revoked')
);
CREATE INDEX agents_org_status_idx ON axo.agents (organization_id, status);

CREATE TABLE axo.agent_credentials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES axo.organizations (id),
  agent_id           uuid NOT NULL,
  -- Public lookup handle (24 hex chars). Knowing it proves nothing.
  key_id             text NOT NULL UNIQUE CHECK (key_id ~ '^[0-9a-f]{24}$'),
  -- HMAC-SHA-256 of the secret under a server-side pepper. The plaintext key is shown once and never stored.
  secret_hash        bytea NOT NULL CHECK (octet_length(secret_hash) = 32),
  hash_version       smallint NOT NULL DEFAULT 1 CHECK (hash_version >= 1),
  created_by_user_id uuid NOT NULL REFERENCES axo.users (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  revoked_reason     text CHECK (revoked_reason IN ('manual', 'rotated', 'agent_revoked')),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, agent_id) REFERENCES axo.agents (organization_id, id),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
CREATE INDEX agent_credentials_active_idx ON axo.agent_credentials (agent_id) WHERE revoked_at IS NULL;

ALTER TABLE axo.agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE axo.agent_credentials ENABLE ROW LEVEL SECURITY;

-- Management: viewers may read, owners and admins may write. The secret hash is not readable by anyone at runtime
-- (column-level privilege); only axo.lookup_credential, below, returns it, and only to the agent-facing role.
GRANT SELECT ON axo.agents TO axo_management;
GRANT INSERT ON axo.agents TO axo_management;
GRANT UPDATE (status, suspended_at, revoked_at) ON axo.agents TO axo_management;
GRANT SELECT (id, organization_id, agent_id, key_id, hash_version, created_by_user_id, created_at, expires_at,
              revoked_at, revoked_reason) ON axo.agent_credentials TO axo_management;
GRANT INSERT ON axo.agent_credentials TO axo_management;
GRANT UPDATE (revoked_at, revoked_reason) ON axo.agent_credentials TO axo_management;

CREATE POLICY agents_read ON axo.agents FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY agents_insert ON axo.agents FOR INSERT TO axo_management
  WITH CHECK (organization_id = axo.current_org() AND created_by_user_id = axo.current_user_id()
              AND axo.has_role(organization_id, ARRAY['owner', 'admin']));
CREATE POLICY agents_update ON axo.agents FOR UPDATE TO axo_management
  USING (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY credentials_read ON axo.agent_credentials FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY credentials_insert ON axo.agent_credentials FOR INSERT TO axo_management
  WITH CHECK (organization_id = axo.current_org() AND created_by_user_id = axo.current_user_id()
              AND axo.has_role(organization_id, ARRAY['owner', 'admin']));
CREATE POLICY credentials_update ON axo.agent_credentials FOR UPDATE TO axo_management
  USING (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin']));

-- Agent lifecycle: only status moves, revoked is final, suspended is reversible.
CREATE FUNCTION axo.guard_agent_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.environment_id <> OLD.environment_id
     OR NEW.owner_user_id <> OLD.owner_user_id OR NEW.name <> OLD.name
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.created_by_user_id <> OLD.created_by_user_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'agent identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'revoked' THEN
    RAISE EXCEPTION 'a revoked agent cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER agents_guard BEFORE UPDATE ON axo.agents
  FOR EACH ROW EXECUTE FUNCTION axo.guard_agent_update();

CREATE FUNCTION axo.guard_agent_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'active' OR NEW.suspended_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'an agent is registered active' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER agents_insert_guard BEFORE INSERT ON axo.agents
  FOR EACH ROW EXECUTE FUNCTION axo.guard_agent_insert();

-- Credentials: only revocation may happen to an existing one, once; at most two are active per agent (an old and a
-- new one during rotation).
CREATE FUNCTION axo.guard_credential_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.agent_id <> OLD.agent_id
     OR NEW.key_id <> OLD.key_id OR NEW.secret_hash <> OLD.secret_hash OR NEW.hash_version <> OLD.hash_version
     OR NEW.created_by_user_id <> OLD.created_by_user_id OR NEW.created_at <> OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'only revocation may change a credential' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
                                     OR NEW.revoked_reason IS DISTINCT FROM OLD.revoked_reason) THEN
    RAISE EXCEPTION 'a revoked credential cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER credentials_guard BEFORE UPDATE ON axo.agent_credentials
  FOR EACH ROW EXECUTE FUNCTION axo.guard_credential_update();

CREATE FUNCTION axo.guard_credential_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_active integer;
BEGIN
  IF NEW.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'a credential is issued unrevoked' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO v_active FROM axo.agent_credentials c
   WHERE c.agent_id = NEW.agent_id AND c.revoked_at IS NULL
     AND (c.expires_at IS NULL OR c.expires_at > clock_timestamp());
  IF v_active >= 2 THEN
    RAISE EXCEPTION 'an agent may have at most two active credentials' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER credentials_insert_guard BEFORE INSERT ON axo.agent_credentials
  FOR EACH ROW EXECUTE FUNCTION axo.guard_credential_insert();

-- ---------------------------------------------------------------------------------------------------------------
-- Credential lookup for agent authentication. This is the single place a tenant is resolved BEFORE any tenant
-- context exists, so it is a deliberate, tiny SECURITY DEFINER hole in row-level security: it takes one argument,
-- returns at most one row and only what is needed to verify a secret. State checks (revoked, expired, suspended,
-- halted) happen in axo.enter_agent_context, after the secret has been verified.
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION axo.lookup_credential(p_key_id text)
  RETURNS TABLE (credential_id uuid, secret_hash bytea, hash_version smallint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT c.id, c.secret_hash, c.hash_version FROM axo.agent_credentials c WHERE c.key_id = p_key_id
  $$;
GRANT EXECUTE ON FUNCTION axo.lookup_credential(text) TO axo_agent_api;
