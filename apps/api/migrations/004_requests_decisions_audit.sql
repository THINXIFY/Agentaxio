-- 004: action requests, decisions, audit events, the request state machine and the agent-context entry point.

-- The legal status transitions (docs/BE-01A-ARCHITECTURE-REVIEW.md 4.3). A test asserts this table equals
-- allTransitions() from packages/contracts, so the code and the database cannot drift apart.
CREATE TABLE axo.request_status_transitions (
  from_status text NOT NULL,
  to_status   text NOT NULL,
  PRIMARY KEY (from_status, to_status)
);
INSERT INTO axo.request_status_transitions (from_status, to_status) VALUES
  ('pending_approval', 'approved'), ('pending_approval', 'denied'), ('pending_approval', 'expired'),
  ('approved', 'queued_execution'), ('approved', 'denied'), ('approved', 'expired'),
  ('queued_execution', 'running'), ('queued_execution', 'denied'), ('queued_execution', 'expired'),
  ('running', 'succeeded'), ('running', 'failed'), ('running', 'unknown');
-- No runtime role has any privilege on it; it is read only by the SECURITY DEFINER guard below.

CREATE TABLE axo.action_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES axo.organizations (id),
  agent_id                  uuid NOT NULL,
  environment_id            uuid NOT NULL,
  action_key                text NOT NULL CHECK (action_key ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$'
                                                 AND char_length(action_key) <= 64),
  resource                  text NOT NULL CHECK (char_length(resource) <= 128),
  -- Scoped to (organization, agent): another agent can reuse the same key without any interaction.
  request_key               text NOT NULL CHECK (char_length(request_key) BETWEEN 16 AND 128
                                                 AND request_key ~ '^[A-Za-z0-9._:-]+$'),
  -- SHA-256 over the canonical {version, action, resource, environment, parameters}. Approvals and (M02) grants
  -- refer to it; the executor recomputes it from canonical_parameters before it acts.
  canonical_digest          text NOT NULL CHECK (canonical_digest ~ '^[0-9a-f]{64}$'),
  -- The exact, normalized parameters the reviewer will see and the executor will use. Contains personal data: it
  -- must never be copied into logs, audit metadata or error bodies. Reduced to the digest by a retention job (Q9).
  canonical_parameters      jsonb NOT NULL CHECK (jsonb_typeof(canonical_parameters) = 'object'),
  status                    text NOT NULL CHECK (status IN ('denied', 'pending_approval', 'approved', 'queued_execution',
                                                             'running', 'succeeded', 'failed', 'expired', 'unknown')),
  originating_credential_id uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                timestamptz NOT NULL,
  UNIQUE (organization_id, agent_id, request_key),
  UNIQUE (organization_id, id),
  CHECK (expires_at > created_at),
  -- The agent must belong to the stated environment of the stated organization.
  FOREIGN KEY (organization_id, agent_id, environment_id) REFERENCES axo.agents (organization_id, id, environment_id),
  FOREIGN KEY (organization_id, originating_credential_id) REFERENCES axo.agent_credentials (organization_id, id)
);
CREATE INDEX action_requests_org_status_idx ON axo.action_requests (organization_id, status, created_at DESC);
CREATE INDEX action_requests_agent_idx ON axo.action_requests (agent_id, status);
CREATE INDEX action_requests_credential_idx ON axo.action_requests (originating_credential_id);

CREATE TABLE axo.decisions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES axo.organizations (id),
  action_request_id         uuid NOT NULL,
  result                    text NOT NULL CHECK (result IN ('deny', 'require_approval', 'allow')),
  reason_code               text CHECK (reason_code IS NULL OR reason_code IN (
                              'POLICY_DENY', 'UNKNOWN_ACTION', 'HUMAN_REVIEW_REQUIRED', 'APPROVAL_DENIED',
                              'APPROVAL_EXPIRED', 'AGENT_SUSPENDED', 'CREDENTIAL_REVOKED', 'ENVIRONMENT_HALTED',
                              'POLICY_CHANGED', 'EVALUATOR_ERROR', 'EXECUTION_FAILED', 'OUTCOME_UNKNOWN')),
  basis                     text NOT NULL CHECK (basis IN (
                              'explicit_deny', 'approval_rule', 'allow_rule', 'implicit_deny', 'evaluator_error',
                              'unknown_action', 'environment_halted', 'agent_suspended', 'credential_revoked')),
  policy_version_id         uuid,
  policy_epoch              bigint NOT NULL CHECK (policy_epoch >= 0),
  matched_policy_version_ids uuid[] NOT NULL DEFAULT '{}',
  decided_at                timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, action_request_id) REFERENCES axo.action_requests (organization_id, id),
  FOREIGN KEY (organization_id, policy_version_id) REFERENCES axo.policy_versions (organization_id, id)
);
CREATE INDEX decisions_request_idx ON axo.decisions (action_request_id, decided_at);

CREATE TABLE axo.audit_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES axo.organizations (id),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_type      text NOT NULL CHECK (actor_type IN ('agent', 'user', 'system')),
  actor_id        uuid,
  event_type      text NOT NULL CHECK (event_type ~ '^[a-z_]+(\.[a-z_]+)+$' AND char_length(event_type) <= 64),
  object_type     text NOT NULL CHECK (object_type ~ '^[a-z_]+$' AND char_length(object_type) <= 32),
  object_id       uuid,
  request_id      uuid,
  trace_id        text CHECK (trace_id IS NULL OR char_length(trace_id) <= 64),
  -- Ids, field NAMES, reason codes, versions, digests. Never parameter values, secrets or headers.
  metadata        jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'
                                                     AND pg_column_size(metadata) <= 4096)
);
CREATE INDEX audit_events_org_time_idx ON axo.audit_events (organization_id, occurred_at DESC);
CREATE INDEX audit_events_request_idx ON axo.audit_events (organization_id, request_id) WHERE request_id IS NOT NULL;

ALTER TABLE axo.action_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE axo.decisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE axo.audit_events    ENABLE ROW LEVEL SECURITY;

-- ---- state machine guards -----------------------------------------------------------------------------------
CREATE FUNCTION axo.guard_request_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('denied', 'pending_approval', 'approved') THEN
    RAISE EXCEPTION 'a request cannot be created in status %', NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER action_requests_insert_guard BEFORE INSERT ON axo.action_requests
  FOR EACH ROW EXECUTE FUNCTION axo.guard_request_insert();

-- SECURITY DEFINER so the transition table needs no privilege for the caller.
CREATE FUNCTION axo.guard_request_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.agent_id <> OLD.agent_id
     OR NEW.environment_id <> OLD.environment_id OR NEW.action_key <> OLD.action_key
     OR NEW.resource <> OLD.resource OR NEW.request_key <> OLD.request_key
     OR NEW.canonical_digest <> OLD.canonical_digest OR NEW.canonical_parameters <> OLD.canonical_parameters
     OR NEW.originating_credential_id <> OLD.originating_credential_id
     OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'only the status of an action request may change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT EXISTS (
       SELECT 1 FROM axo.request_status_transitions t
        WHERE t.from_status = OLD.status AND t.to_status = NEW.status) THEN
    RAISE EXCEPTION 'illegal status transition % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;
CREATE TRIGGER action_requests_update_guard BEFORE UPDATE ON axo.action_requests
  FOR EACH ROW EXECUTE FUNCTION axo.guard_request_update();
CREATE TRIGGER action_requests_no_delete BEFORE DELETE ON axo.action_requests
  FOR EACH ROW EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER action_requests_no_truncate BEFORE TRUNCATE ON axo.action_requests
  FOR EACH STATEMENT EXECUTE FUNCTION axo.reject_modification();

CREATE TRIGGER decisions_immutable BEFORE UPDATE OR DELETE ON axo.decisions
  FOR EACH ROW EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER decisions_no_truncate BEFORE TRUNCATE ON axo.decisions
  FOR EACH STATEMENT EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON axo.audit_events
  FOR EACH ROW EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON axo.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION axo.reject_modification();

-- ---- privileges and row-level security: agent API -----------------------------------------------------------
-- An agent sees and creates only its OWN requests. It can move one of its own requests from approved to
-- queued_execution (the direct-allow path) and nothing else. It cannot read the audit log.
GRANT SELECT, INSERT ON axo.action_requests TO axo_agent_api;
GRANT UPDATE (status) ON axo.action_requests TO axo_agent_api;
GRANT SELECT, INSERT ON axo.decisions TO axo_agent_api;
GRANT INSERT ON axo.audit_events TO axo_agent_api;

CREATE POLICY requests_agent_read ON axo.action_requests FOR SELECT TO axo_agent_api
  USING (organization_id = axo.current_org() AND agent_id = axo.current_agent());
CREATE POLICY requests_agent_insert ON axo.action_requests FOR INSERT TO axo_agent_api
  WITH CHECK (organization_id = axo.current_org() AND agent_id = axo.current_agent()
              AND environment_id = axo.current_env());
CREATE POLICY requests_agent_update ON axo.action_requests FOR UPDATE TO axo_agent_api
  USING (organization_id = axo.current_org() AND agent_id = axo.current_agent() AND status = 'approved')
  WITH CHECK (organization_id = axo.current_org() AND agent_id = axo.current_agent()
              AND status = 'queued_execution');
CREATE POLICY decisions_agent_read ON axo.decisions FOR SELECT TO axo_agent_api
  USING (organization_id = axo.current_org()
         AND EXISTS (SELECT 1 FROM axo.action_requests r WHERE r.id = action_request_id));
CREATE POLICY decisions_agent_insert ON axo.decisions FOR INSERT TO axo_agent_api
  WITH CHECK (organization_id = axo.current_org()
              AND EXISTS (SELECT 1 FROM axo.action_requests r WHERE r.id = action_request_id));
CREATE POLICY audit_agent_insert ON axo.audit_events FOR INSERT TO axo_agent_api
  WITH CHECK (organization_id = axo.current_org() AND actor_type = 'agent' AND actor_id = axo.current_agent());

-- ---- privileges and row-level security: management ----------------------------------------------------------
-- Management may read everything in its organization (any role) and may only cancel in-flight requests
-- (pending/approved/queued -> denied) when an agent or credential is withdrawn.
GRANT SELECT ON axo.action_requests, axo.decisions, axo.audit_events TO axo_management;
GRANT UPDATE (status) ON axo.action_requests TO axo_management;
GRANT INSERT ON axo.decisions, axo.audit_events TO axo_management;

CREATE POLICY requests_mgmt_read ON axo.action_requests FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY requests_mgmt_cancel ON axo.action_requests FOR UPDATE TO axo_management
  USING (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin'])
         AND status IN ('pending_approval', 'approved', 'queued_execution'))
  WITH CHECK (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin'])
              AND status = 'denied');
CREATE POLICY decisions_mgmt_read ON axo.decisions FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY decisions_mgmt_insert ON axo.decisions FOR INSERT TO axo_management
  WITH CHECK (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin']));
CREATE POLICY audit_mgmt_read ON axo.audit_events FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));
CREATE POLICY audit_mgmt_insert ON axo.audit_events FOR INSERT TO axo_management
  WITH CHECK (organization_id = axo.current_org() AND actor_type = 'user' AND actor_id = axo.current_user_id()
              AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));

-- ---------------------------------------------------------------------------------------------------------------
-- The ONLY way an agent-facing transaction acquires a tenant. Given a credential whose secret the caller has
-- already verified, it
--   1. derives organization, agent and environment from database rows (nothing is taken from the request),
--   2. takes locks in a fixed order (environment shared, agent exclusive/shared, credential shared) so that policy
--      changes, suspension, revocation and halting serialize against in-flight decisions with no deadlock cycle,
--   3. sets the transaction-local context that row-level security reads, and
--   4. returns the state AFTER locking (a concurrent change either committed before the lock was granted, and is
--      seen, or must wait until this transaction ends).
-- p_write = false takes only shared locks (status polling).
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION axo.enter_agent_context(p_credential_id uuid, p_write boolean)
  RETURNS TABLE (
    organization_id uuid, agent_id uuid, environment_id uuid, agent_status text, environment_state text,
    policy_epoch bigint, credential_state text, pending_requests integer
  )
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  v_org uuid;
  v_agent uuid;
  v_env uuid;
BEGIN
  SELECT c.organization_id, c.agent_id, a.environment_id INTO v_org, v_agent, v_env
    FROM axo.agent_credentials c
    JOIN axo.agents a ON a.organization_id = c.organization_id AND a.id = c.agent_id
   WHERE c.id = p_credential_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown credential' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM axo.environments e WHERE e.organization_id = v_org AND e.id = v_env FOR SHARE;
  IF p_write THEN
    PERFORM 1 FROM axo.agents a WHERE a.organization_id = v_org AND a.id = v_agent FOR UPDATE;
  ELSE
    PERFORM 1 FROM axo.agents a WHERE a.organization_id = v_org AND a.id = v_agent FOR SHARE;
  END IF;
  PERFORM 1 FROM axo.agent_credentials c WHERE c.id = p_credential_id FOR SHARE;

  PERFORM set_config('app.organization_id', v_org::text, true);
  PERFORM set_config('app.agent_id', v_agent::text, true);
  PERFORM set_config('app.environment_id', v_env::text, true);
  PERFORM set_config('app.user_id', '', true);

  RETURN QUERY
    SELECT v_org, v_agent, v_env, a.status, e.enforcement_state, e.policy_epoch,
           CASE WHEN c.revoked_at IS NOT NULL THEN 'revoked'
                WHEN c.expires_at IS NOT NULL AND c.expires_at <= clock_timestamp() THEN 'expired'
                ELSE 'usable' END,
           (SELECT count(*)::integer FROM axo.action_requests r
             WHERE r.organization_id = v_org AND r.agent_id = v_agent AND r.status = 'pending_approval'
               AND r.expires_at > clock_timestamp())
      FROM axo.agents a, axo.environments e, axo.agent_credentials c
     WHERE a.organization_id = v_org AND a.id = v_agent
       AND e.organization_id = v_org AND e.id = v_env
       AND c.id = p_credential_id;
END
$$;
GRANT EXECUTE ON FUNCTION axo.enter_agent_context(uuid, boolean) TO axo_agent_api;

-- Safety net: whatever else happened, no function in the axo schema is executable by PUBLIC. Explicit grants above
-- (and only those) remain. Later migrations that add functions must grant EXECUTE explicitly to the roles that need it.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p WHERE p.pronamespace = 'axo'::regnamespace LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.signature);
  END LOOP;
END
$$;
