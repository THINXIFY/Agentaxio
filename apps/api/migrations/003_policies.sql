-- 003: the action catalog, policies and immutable policy versions.
-- A policy header fixes WHAT it governs (action, optional environment, optional agent) and never changes. Its
-- behaviour lives in numbered, immutable versions; an edit (including disabling) inserts the next version. The
-- current version of a policy is its highest one.

-- Global, code-owned catalog (ADR D8). Changed only by migrations. Schemas live in packages/contracts.
CREATE TABLE axo.action_definitions (
  key            text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$' AND char_length(key) <= 64),
  schema_version integer NOT NULL CHECK (schema_version >= 1),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired'))
);
INSERT INTO axo.action_definitions (key, schema_version) VALUES ('crm.lead.create', 1);
GRANT SELECT ON axo.action_definitions TO axo_agent_api, axo_management;

CREATE TABLE axo.policies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES axo.organizations (id),
  action_key         text NOT NULL REFERENCES axo.action_definitions (key),
  -- NULL environment = every environment of the organization; NULL agent = every agent in scope.
  environment_id     uuid,
  agent_id           uuid,
  created_by_user_id uuid NOT NULL REFERENCES axo.users (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, environment_id) REFERENCES axo.environments (organization_id, id),
  FOREIGN KEY (organization_id, agent_id) REFERENCES axo.agents (organization_id, id),
  -- When both are given they must agree: the agent must live in that environment.
  FOREIGN KEY (organization_id, agent_id, environment_id) REFERENCES axo.agents (organization_id, id, environment_id)
);
CREATE INDEX policies_lookup_idx ON axo.policies (organization_id, action_key);

CREATE TABLE axo.policy_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES axo.organizations (id),
  policy_id          uuid NOT NULL,
  version            integer NOT NULL CHECK (version >= 1),
  effect             text NOT NULL CHECK (effect IN ('deny', 'require_approval', 'allow')),
  -- Validated by packages/contracts before insert; the database only guarantees the outer shape.
  conditions         jsonb NOT NULL CHECK (jsonb_typeof(conditions) = 'object'
                                           AND jsonb_typeof(conditions -> 'all') = 'array'),
  priority           integer NOT NULL CHECK (priority BETWEEN 0 AND 1000),
  enabled            boolean NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES axo.users (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, version),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, policy_id) REFERENCES axo.policies (organization_id, id)
);

ALTER TABLE axo.policies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE axo.policy_versions  ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON axo.policies, axo.policy_versions TO axo_management;
GRANT SELECT ON axo.policies, axo.policy_versions TO axo_agent_api;

-- Management: viewers read, owners and admins write.
CREATE POLICY policies_read ON axo.policies FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY policies_insert ON axo.policies FOR INSERT TO axo_management
  WITH CHECK (organization_id = axo.current_org() AND created_by_user_id = axo.current_user_id()
              AND axo.has_role(organization_id, ARRAY['owner', 'admin']));
CREATE POLICY policy_versions_read ON axo.policy_versions FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY policy_versions_insert ON axo.policy_versions FOR INSERT TO axo_management
  WITH CHECK (organization_id = axo.current_org() AND created_by_user_id = axo.current_user_id()
              AND axo.has_role(organization_id, ARRAY['owner', 'admin']));

-- Agent API: only the policies that can apply to the authenticated agent (its organization, its environment, its
-- own or organization-wide scope). The context comes from axo.enter_agent_context, not from the request.
CREATE POLICY policies_agent_read ON axo.policies FOR SELECT TO axo_agent_api
  USING (organization_id = axo.current_org()
         AND (environment_id IS NULL OR environment_id = axo.current_env())
         AND (agent_id IS NULL OR agent_id = axo.current_agent()));
CREATE POLICY policy_versions_agent_read ON axo.policy_versions FOR SELECT TO axo_agent_api
  USING (organization_id = axo.current_org()
         AND EXISTS (SELECT 1 FROM axo.policies p WHERE p.id = policy_id));

-- Bound the number of policies one organization can pile onto an action, so a policy load stays small.
CREATE FUNCTION axo.guard_policy_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM axo.policies p
   WHERE p.organization_id = NEW.organization_id AND p.action_key = NEW.action_key;
  IF v_count >= 200 THEN
    RAISE EXCEPTION 'too many policies for this action' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER policies_insert_guard BEFORE INSERT ON axo.policies
  FOR EACH ROW EXECUTE FUNCTION axo.guard_policy_insert();

-- Versions are numbered 1, 2, 3 ... with no gaps. Concurrent writers to the same policy are serialized, and the loser
-- of a race sees the winner's version and fails (optimistic concurrency): revision consistency is enforced here, not
-- by caller discipline.
CREATE FUNCTION axo.guard_policy_version_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_max integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('axo.policy:' || NEW.policy_id::text, 0));
  SELECT coalesce(max(v.version), 0) INTO v_max FROM axo.policy_versions v WHERE v.policy_id = NEW.policy_id;
  IF NEW.version <> v_max + 1 THEN
    RAISE EXCEPTION 'stale policy version: expected %, current is %', NEW.version - 1, v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER policy_versions_insert_guard BEFORE INSERT ON axo.policy_versions
  FOR EACH ROW EXECUTE FUNCTION axo.guard_policy_version_insert();

-- Any new version bumps the policy epoch of every environment it can affect, in the same transaction. Environments
-- are locked in id order. Decisions hold a shared lock on their environment while they read the epoch and the
-- policies, so a decision always sees a matching (epoch, policies) pair and never a half-applied change.
CREATE FUNCTION axo.bump_policy_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
  v_env uuid;
BEGIN
  SELECT p.organization_id, p.environment_id INTO v_org, v_env FROM axo.policies p WHERE p.id = NEW.policy_id;
  UPDATE axo.environments e SET policy_epoch = e.policy_epoch + 1
   WHERE e.id IN (SELECT x.id FROM axo.environments x
                   WHERE x.organization_id = v_org AND (v_env IS NULL OR x.id = v_env)
                   ORDER BY x.id FOR UPDATE);
  RETURN NULL;
END
$$;
CREATE TRIGGER policy_versions_epoch AFTER INSERT ON axo.policy_versions
  FOR EACH ROW EXECUTE FUNCTION axo.bump_policy_epoch();

-- Append-only, even for the owner.
CREATE TRIGGER policies_immutable BEFORE UPDATE OR DELETE ON axo.policies
  FOR EACH ROW EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER policies_no_truncate BEFORE TRUNCATE ON axo.policies
  FOR EACH STATEMENT EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER policy_versions_immutable BEFORE UPDATE OR DELETE ON axo.policy_versions
  FOR EACH ROW EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER policy_versions_no_truncate BEFORE TRUNCATE ON axo.policy_versions
  FOR EACH STATEMENT EXECUTE FUNCTION axo.reject_modification();
