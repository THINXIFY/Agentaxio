-- 006: encrypted request parameters, human approvals, single-use execution grants, execution attempts, and the
-- trusted executor's entry points.
--
-- Design (docs/BE-02-DECISIONS.md D5-D10):
--  * Approvals and the whole execution lifecycle are changed ONLY by SECURITY DEFINER functions. No runtime role has
--    UPDATE on approvals, grants or attempts, and axo_executor has no table privilege at all.
--  * Lock order everywhere: environment -> agent -> credential -> approval -> request -> grant.
--  * Approval is permission, not execution: executing needs a claim, which re-checks everything in the same
--    transaction that consumes the grant.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axo_executor') THEN
    RAISE EXCEPTION 'database role axo_executor is missing: run sql/bootstrap-roles.sql as a superuser first';
  END IF;
  -- Parameters become encrypted in this migration; plaintext rows from M01 cannot be carried over. M01 held no real
  -- data, but refuse to destroy parameters that something is still waiting on.
  IF EXISTS (SELECT 1 FROM axo.action_requests WHERE status IN ('pending_approval', 'approved', 'queued_execution', 'running')) THEN
    RAISE EXCEPTION 'cancel or finish in-flight requests before applying migration 006 (their stored parameters cannot be carried over)'
      USING ERRCODE = '55000';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA axo TO axo_executor;

-- ---------------------------------------------------------------------------------------------------------------
-- Encrypted parameters. The application encrypts (AES-256-GCM, additional data = organization + request + digest);
-- the database never sees plaintext and no runtime role can read the ciphertext column directly.
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE axo.action_requests
  ADD COLUMN parameters_ciphertext bytea,
  ADD COLUMN parameters_key_id text,
  ADD COLUMN parameters_purged_at timestamptz;
ALTER TABLE axo.action_requests DISABLE TRIGGER action_requests_update_guard;
UPDATE axo.action_requests SET parameters_purged_at = clock_timestamp();
ALTER TABLE axo.action_requests DROP COLUMN canonical_parameters;

CREATE OR REPLACE FUNCTION axo.guard_request_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.agent_id <> OLD.agent_id
     OR NEW.environment_id <> OLD.environment_id OR NEW.action_key <> OLD.action_key
     OR NEW.resource <> OLD.resource OR NEW.request_key <> OLD.request_key
     OR NEW.canonical_digest <> OLD.canonical_digest
     OR NEW.parameters_key_id IS DISTINCT FROM OLD.parameters_key_id
     OR NEW.originating_credential_id <> OLD.originating_credential_id
     OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'only the status of an action request may change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The ciphertext may only ever be erased (retention), together with the purge timestamp.
  IF NEW.parameters_ciphertext IS DISTINCT FROM OLD.parameters_ciphertext
     AND NOT (NEW.parameters_ciphertext IS NULL AND OLD.parameters_ciphertext IS NOT NULL
              AND NEW.parameters_purged_at IS NOT NULL) THEN
    RAISE EXCEPTION 'request parameters are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.parameters_purged_at IS NOT NULL AND NEW.parameters_purged_at IS DISTINCT FROM OLD.parameters_purged_at THEN
    RAISE EXCEPTION 'request parameters are immutable' USING ERRCODE = 'insufficient_privilege';
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
ALTER TABLE axo.action_requests ENABLE TRIGGER action_requests_update_guard;

ALTER TABLE axo.action_requests
  ADD CONSTRAINT action_requests_parameters_present CHECK (parameters_ciphertext IS NOT NULL OR parameters_purged_at IS NOT NULL),
  ADD CONSTRAINT action_requests_key_id_present CHECK (parameters_ciphertext IS NULL OR parameters_key_id IS NOT NULL);

-- Column-level read access: everything except the ciphertext and its key id.
REVOKE SELECT ON axo.action_requests FROM axo_agent_api, axo_management;
GRANT SELECT (id, organization_id, agent_id, environment_id, action_key, resource, request_key, canonical_digest,
              status, originating_credential_id, created_at, updated_at, expires_at, parameters_purged_at)
  ON axo.action_requests TO axo_agent_api, axo_management;

-- Management no longer changes requests or writes decisions itself: withdrawing requests is a function (below).
REVOKE UPDATE (status) ON axo.action_requests FROM axo_management;
REVOKE INSERT ON axo.decisions FROM axo_management;
DROP POLICY requests_mgmt_cancel ON axo.action_requests;
DROP POLICY decisions_mgmt_insert ON axo.decisions;

ALTER TABLE axo.decisions DROP CONSTRAINT decisions_reason_code_check, DROP CONSTRAINT decisions_basis_check;
ALTER TABLE axo.decisions
  ADD CONSTRAINT decisions_reason_code_check CHECK (reason_code IS NULL OR reason_code IN (
    'POLICY_DENY', 'UNKNOWN_ACTION', 'HUMAN_REVIEW_REQUIRED', 'APPROVAL_DENIED', 'APPROVAL_EXPIRED', 'AGENT_SUSPENDED',
    'CREDENTIAL_REVOKED', 'ENVIRONMENT_HALTED', 'POLICY_CHANGED', 'EVALUATOR_ERROR', 'EXECUTION_FAILED',
    'OUTCOME_UNKNOWN', 'DIGEST_MISMATCH', 'GRANT_EXPIRED')),
  ADD CONSTRAINT decisions_basis_check CHECK (basis IN (
    'explicit_deny', 'approval_rule', 'allow_rule', 'implicit_deny', 'evaluator_error', 'unknown_action',
    'environment_halted', 'agent_suspended', 'credential_revoked', 'approval_rejected', 'approval_expired',
    'policy_changed', 'digest_mismatch', 'grant_expired'));

-- ---------------------------------------------------------------------------------------------------------------
-- Approvals
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE axo.approval_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES axo.organizations (id),
  action_request_id  uuid NOT NULL,
  state              text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected', 'expired', 'canceled')),
  requested_digest   text NOT NULL CHECK (requested_digest ~ '^[0-9a-f]{64}$'),
  policy_version_id  uuid,
  policy_epoch       bigint NOT NULL CHECK (policy_epoch >= 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  decided_by_user_id uuid,
  decided_at         timestamptz,
  decision_comment   text CHECK (decision_comment IS NULL OR char_length(decision_comment) <= 500),
  reviewed_digest    text CHECK (reviewed_digest IS NULL OR reviewed_digest ~ '^[0-9a-f]{64}$'),
  UNIQUE (action_request_id),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, action_request_id) REFERENCES axo.action_requests (organization_id, id),
  FOREIGN KEY (organization_id, policy_version_id) REFERENCES axo.policy_versions (organization_id, id),
  FOREIGN KEY (organization_id, decided_by_user_id) REFERENCES axo.memberships (organization_id, user_id),
  CHECK (state <> 'pending' OR (decided_at IS NULL AND decided_by_user_id IS NULL AND reviewed_digest IS NULL)),
  CHECK (state NOT IN ('approved', 'rejected') OR (decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL AND reviewed_digest IS NOT NULL)),
  CHECK (state NOT IN ('expired', 'canceled') OR (decided_at IS NOT NULL AND decided_by_user_id IS NULL))
);
CREATE INDEX approval_requests_org_state_idx ON axo.approval_requests (organization_id, state, created_at DESC);
ALTER TABLE axo.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION axo.guard_approval_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.action_request_id <> OLD.action_request_id
     OR NEW.requested_digest <> OLD.requested_digest OR NEW.policy_epoch <> OLD.policy_epoch
     OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id
     OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'approval identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.state <> 'pending' THEN
    RAISE EXCEPTION 'a decided approval cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER approval_requests_guard BEFORE UPDATE ON axo.approval_requests
  FOR EACH ROW EXECUTE FUNCTION axo.guard_approval_update();
CREATE TRIGGER approval_requests_no_delete BEFORE DELETE ON axo.approval_requests
  FOR EACH ROW EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER approval_requests_no_truncate BEFORE TRUNCATE ON axo.approval_requests
  FOR EACH STATEMENT EXECUTE FUNCTION axo.reject_modification();

-- The agent API creates the pending approval alongside the request it belongs to; people read; only decide_approval
-- (and the withdrawal / expiry functions) change one.
GRANT INSERT ON axo.approval_requests TO axo_agent_api;
GRANT SELECT ON axo.approval_requests TO axo_management;
CREATE POLICY approvals_agent_insert ON axo.approval_requests FOR INSERT TO axo_agent_api
  WITH CHECK (organization_id = axo.current_org() AND state = 'pending'
              AND EXISTS (SELECT 1 FROM axo.action_requests r WHERE r.id = action_request_id));
CREATE POLICY approvals_mgmt_read ON axo.approval_requests FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));

-- ---------------------------------------------------------------------------------------------------------------
-- Grants and attempts
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE axo.execution_grants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES axo.organizations (id),
  action_request_id  uuid NOT NULL,
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  consumed_at        timestamptz,
  invalidated_at     timestamptz,
  invalidated_reason text CHECK (invalidated_reason IS NULL OR char_length(invalidated_reason) <= 64),
  UNIQUE (action_request_id),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, action_request_id) REFERENCES axo.action_requests (organization_id, id),
  CHECK (NOT (consumed_at IS NOT NULL AND invalidated_at IS NOT NULL)),
  CHECK ((invalidated_at IS NULL) = (invalidated_reason IS NULL))
);
CREATE INDEX execution_grants_open_idx ON axo.execution_grants (created_at) WHERE consumed_at IS NULL AND invalidated_at IS NULL;
ALTER TABLE axo.execution_grants ENABLE ROW LEVEL SECURITY;

-- A grant is single-use: consumed or invalidated exactly once, then frozen.
CREATE FUNCTION axo.guard_grant_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.action_request_id <> OLD.action_request_id
     OR NEW.digest <> OLD.digest OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'grant identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.consumed_at IS NOT NULL OR OLD.invalidated_at IS NOT NULL THEN
    RAISE EXCEPTION 'a used grant cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER execution_grants_guard BEFORE UPDATE ON axo.execution_grants
  FOR EACH ROW EXECUTE FUNCTION axo.guard_grant_update();
CREATE TRIGGER execution_grants_no_delete BEFORE DELETE ON axo.execution_grants
  FOR EACH ROW EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER execution_grants_no_truncate BEFORE TRUNCATE ON axo.execution_grants
  FOR EACH STATEMENT EXECUTE FUNCTION axo.reject_modification();

-- Grants are created by the database when a request becomes queued, never by a caller.
CREATE FUNCTION axo.create_grant_on_queue() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  INSERT INTO axo.execution_grants (organization_id, action_request_id, digest, expires_at)
  VALUES (NEW.organization_id, NEW.id, NEW.canonical_digest, clock_timestamp() + interval '5 minutes');
  RETURN NULL;
END
$$;
CREATE TRIGGER action_requests_grant AFTER UPDATE OF status ON axo.action_requests
  FOR EACH ROW WHEN (OLD.status = 'approved' AND NEW.status = 'queued_execution')
  EXECUTE FUNCTION axo.create_grant_on_queue();

-- Status reporting needs a request's grant expiry (not the grant id).
GRANT SELECT (action_request_id, organization_id, expires_at, consumed_at, invalidated_at) ON axo.execution_grants TO axo_agent_api;
GRANT SELECT (id, organization_id, action_request_id, created_at, expires_at, consumed_at, invalidated_at, invalidated_reason)
  ON axo.execution_grants TO axo_management;
CREATE POLICY grants_agent_read ON axo.execution_grants FOR SELECT TO axo_agent_api
  USING (organization_id = axo.current_org() AND EXISTS (SELECT 1 FROM axo.action_requests r WHERE r.id = action_request_id));
CREATE POLICY grants_mgmt_read ON axo.execution_grants FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));

CREATE TABLE axo.execution_attempts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES axo.organizations (id),
  grant_id           uuid NOT NULL,
  action_request_id  uuid NOT NULL,
  executor_id        text NOT NULL CHECK (char_length(executor_id) BETWEEN 1 AND 64),
  connector          text NOT NULL CHECK (connector IN ('mock_crm')),
  state              text NOT NULL DEFAULT 'started' CHECK (state IN ('started', 'succeeded', 'failed', 'unknown')),
  external_reference text CHECK (external_reference IS NULL OR char_length(external_reference) <= 128),
  error_class        text CHECK (error_class IS NULL OR char_length(error_class) <= 64),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  UNIQUE (grant_id),
  UNIQUE (action_request_id),
  FOREIGN KEY (organization_id, grant_id) REFERENCES axo.execution_grants (organization_id, id),
  FOREIGN KEY (organization_id, action_request_id) REFERENCES axo.action_requests (organization_id, id),
  CHECK ((state = 'started') = (finished_at IS NULL))
);
ALTER TABLE axo.execution_attempts ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION axo.guard_attempt_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.grant_id <> OLD.grant_id
     OR NEW.action_request_id <> OLD.action_request_id OR NEW.executor_id <> OLD.executor_id
     OR NEW.connector <> OLD.connector OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'attempt identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.state <> 'started' THEN
    RAISE EXCEPTION 'a finished attempt cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER execution_attempts_guard BEFORE UPDATE ON axo.execution_attempts
  FOR EACH ROW EXECUTE FUNCTION axo.guard_attempt_update();
CREATE TRIGGER execution_attempts_no_delete BEFORE DELETE ON axo.execution_attempts
  FOR EACH ROW EXECUTE FUNCTION axo.reject_modification();
CREATE TRIGGER execution_attempts_no_truncate BEFORE TRUNCATE ON axo.execution_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION axo.reject_modification();
GRANT SELECT ON axo.execution_attempts TO axo_management;
CREATE POLICY attempts_mgmt_read ON axo.execution_attempts FOR SELECT TO axo_management
  USING (organization_id = axo.current_org()
         AND axo.has_role(organization_id, ARRAY['owner', 'admin', 'approver', 'viewer']));

-- The executor reads policies (through row-level security keyed to the context axo.claim_lock_next sets) and has no
-- other table privilege.
GRANT SELECT ON axo.policies, axo.policy_versions, axo.action_definitions TO axo_executor;
CREATE POLICY policies_executor_read ON axo.policies FOR SELECT TO axo_executor
  USING (organization_id = axo.current_org()
         AND (environment_id IS NULL OR environment_id = axo.current_env())
         AND (agent_id IS NULL OR agent_id = axo.current_agent()));
CREATE POLICY policy_versions_executor_read ON axo.policy_versions FOR SELECT TO axo_executor
  USING (organization_id = axo.current_org() AND EXISTS (SELECT 1 FROM axo.policies p WHERE p.id = policy_id));
GRANT EXECUTE ON FUNCTION axo.current_org(), axo.current_agent(), axo.current_env(), axo.current_user_id() TO axo_executor;

-- ---------------------------------------------------------------------------------------------------------------
-- Withdrawal: the single way in-flight requests are cancelled when an agent or credential is withdrawn
-- (replaces the M01 direct UPDATEs). Approvals are cancelled and grants invalidated in the same transaction.
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION axo.withdraw_requests(p_agent uuid, p_credential uuid, p_reason text, p_basis text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_org uuid := axo.current_org();
  v_actor uuid := axo.current_user_id();
  v_count integer;
BEGIN
  IF v_org IS NULL OR v_actor IS NULL OR NOT axo.has_role(v_org, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;
  IF (p_agent IS NULL) = (p_credential IS NULL) THEN RAISE EXCEPTION 'name an agent or a credential' USING ERRCODE = '22023'; END IF;
  IF p_reason NOT IN ('AGENT_SUSPENDED', 'CREDENTIAL_REVOKED') OR p_basis NOT IN ('agent_suspended', 'credential_revoked') THEN
    RAISE EXCEPTION 'invalid reason' USING ERRCODE = '22023';
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS axo_withdrawn (id uuid, environment_id uuid) ON COMMIT DROP;
  DELETE FROM axo_withdrawn;
  INSERT INTO axo_withdrawn
    SELECT r.id, r.environment_id FROM axo.action_requests r
     WHERE r.organization_id = v_org AND r.status IN ('pending_approval', 'approved', 'queued_execution')
       AND ((p_agent IS NOT NULL AND r.agent_id = p_agent) OR (p_credential IS NOT NULL AND r.originating_credential_id = p_credential));
  UPDATE axo.approval_requests a SET state = 'canceled', decided_at = clock_timestamp()
   WHERE a.organization_id = v_org AND a.state = 'pending' AND a.action_request_id IN (SELECT w.id FROM axo_withdrawn w);
  UPDATE axo.action_requests r SET status = 'denied' WHERE r.organization_id = v_org AND r.id IN (SELECT w.id FROM axo_withdrawn w);
  UPDATE axo.execution_grants g SET invalidated_at = clock_timestamp(), invalidated_reason = 'withdrawn'
   WHERE g.organization_id = v_org AND g.consumed_at IS NULL AND g.invalidated_at IS NULL
     AND g.action_request_id IN (SELECT w.id FROM axo_withdrawn w);
  INSERT INTO axo.decisions (organization_id, action_request_id, result, reason_code, basis, policy_epoch)
    SELECT v_org, w.id, 'deny', p_reason, p_basis, e.policy_epoch
      FROM axo_withdrawn w JOIN axo.environments e ON e.organization_id = v_org AND e.id = w.environment_id;
  INSERT INTO axo.audit_events (organization_id, actor_type, actor_id, event_type, object_type, object_id, request_id, metadata)
    SELECT v_org, 'user', v_actor, 'action_request.cancelled', 'action_request', w.id, w.id,
           jsonb_build_object('reason_code', p_reason)
      FROM axo_withdrawn w;
  SELECT count(*) INTO v_count FROM axo_withdrawn;
  RETURN v_count;
END
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- The approval decision. ONE entry point; every check runs here, in the database, under row locks.
-- Outcomes that must leave a record (self-approval, digest mismatch, expiry) are RETURNED, not raised, so the audit
-- event commits with them. Problems with the caller itself (no context, wrong role, no fresh MFA, unknown id) raise.
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION axo.decide_approval(p_approval uuid, p_decision text, p_reviewed_digest text, p_comment text)
  RETURNS TABLE (outcome text, request_status text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_org uuid := axo.current_org();
  v_user uuid := axo.current_user_id();
  ap axo.approval_requests%ROWTYPE;
  r axo.action_requests%ROWTYPE;
  v_owner uuid;
  v_registrar uuid;
  v_issuer uuid;
BEGIN
  IF v_org IS NULL OR v_user IS NULL THEN RAISE EXCEPTION 'no context' USING ERRCODE = '42501'; END IF;
  IF NOT axo.has_role(v_org, ARRAY['owner', 'admin', 'approver']) THEN
    RAISE EXCEPTION 'your role cannot decide approvals' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'unknown decision' USING ERRCODE = '22023'; END IF;
  IF p_reviewed_digest IS NULL OR p_reviewed_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'reviewed digest required' USING ERRCODE = '22023';
  END IF;
  IF p_comment IS NOT NULL AND char_length(p_comment) > 500 THEN RAISE EXCEPTION 'comment too long' USING ERRCODE = '22023'; END IF;
  PERFORM axo.require_step_up();

  SELECT * INTO ap FROM axo.approval_requests a WHERE a.id = p_approval AND a.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'approval not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO r FROM axo.action_requests x WHERE x.id = ap.action_request_id AND x.organization_id = v_org FOR UPDATE;

  IF ap.state <> 'pending' THEN
    RETURN QUERY SELECT 'already_decided'::text, r.status; RETURN;
  END IF;
  IF ap.expires_at <= clock_timestamp() THEN
    UPDATE axo.approval_requests a SET state = 'expired', decided_at = clock_timestamp() WHERE a.id = ap.id;
    IF r.status = 'pending_approval' THEN
      UPDATE axo.action_requests x SET status = 'expired' WHERE x.id = r.id;
    END IF;
    PERFORM axo.audit_write(v_org, 'user', v_user, 'approval.expired', 'approval', ap.id, r.id, '{}');
    RETURN QUERY SELECT 'expired'::text, 'expired'::text; RETURN;
  END IF;
  IF r.status <> 'pending_approval' THEN
    RETURN QUERY SELECT 'not_pending'::text, r.status; RETURN;
  END IF;

  -- Self-approval (D5): the agent's owner, whoever registered the agent, and whoever issued the credential it used.
  SELECT a.owner_user_id, a.created_by_user_id INTO v_owner, v_registrar
    FROM axo.agents a WHERE a.organization_id = v_org AND a.id = r.agent_id;
  SELECT k.created_by_user_id INTO v_issuer FROM axo.agent_credentials k WHERE k.id = r.originating_credential_id;
  IF v_user IN (v_owner, v_registrar, v_issuer) THEN
    PERFORM axo.audit_write(v_org, 'user', v_user, 'approval.self_approval_blocked', 'approval', ap.id, r.id, '{}');
    RETURN QUERY SELECT 'self_approval'::text, r.status; RETURN;
  END IF;

  -- The reviewer must have seen exactly what is stored (S06).
  IF p_reviewed_digest <> r.canonical_digest OR p_reviewed_digest <> ap.requested_digest THEN
    PERFORM axo.audit_write(v_org, 'user', v_user, 'approval.digest_mismatch', 'approval', ap.id, r.id, '{}');
    RETURN QUERY SELECT 'digest_mismatch'::text, r.status; RETURN;
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE axo.approval_requests a SET state = 'rejected', decided_by_user_id = v_user, decided_at = clock_timestamp(),
           decision_comment = p_comment, reviewed_digest = p_reviewed_digest WHERE a.id = ap.id;
    UPDATE axo.action_requests x SET status = 'denied' WHERE x.id = r.id;
    INSERT INTO axo.decisions (organization_id, action_request_id, result, reason_code, basis, policy_epoch)
    VALUES (v_org, r.id, 'deny', 'APPROVAL_DENIED', 'approval_rejected', ap.policy_epoch);
    PERFORM axo.audit_write(v_org, 'user', v_user, 'approval.rejected', 'approval', ap.id, r.id, '{}');
    RETURN QUERY SELECT 'rejected'::text, 'denied'::text; RETURN;
  END IF;

  UPDATE axo.approval_requests a SET state = 'approved', decided_by_user_id = v_user, decided_at = clock_timestamp(),
         decision_comment = p_comment, reviewed_digest = p_reviewed_digest WHERE a.id = ap.id;
  UPDATE axo.action_requests x SET status = 'approved' WHERE x.id = r.id;
  PERFORM axo.audit_write(v_org, 'user', v_user, 'approval.approved', 'approval', ap.id, r.id, '{}');
  -- Queueing creates the single-use grant (trigger). Approved is not executed.
  UPDATE axo.action_requests x SET status = 'queued_execution' WHERE x.id = r.id;
  PERFORM axo.audit_write(v_org, 'user', v_user, 'action_request.queued', 'action_request', r.id, r.id, '{}');
  RETURN QUERY SELECT 'approved'::text, 'queued_execution'::text;
END
$$;

-- What a reviewer is allowed to see, including the decrypted-by-the-caller ciphertext. Owners, admins and approvers
-- only; viewers never receive parameter values.
CREATE FUNCTION axo.review_approval(p_approval uuid)
  RETURNS TABLE (approval_id uuid, state text, approval_created_at timestamptz, approval_expires_at timestamptz,
                 request_id uuid, request_status text, agent_id uuid, agent_name text, environment_name text,
                 action_key text, resource text, digest text, ciphertext bytea, key_id text,
                 policy_epoch bigint, current_policy_epoch bigint, decided_by uuid, decided_at timestamptz,
                 decision_comment text, purged boolean, requested_by_credential uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF axo.current_org() IS NULL OR NOT axo.has_role(axo.current_org(), ARRAY['owner', 'admin', 'approver']) THEN
    RAISE EXCEPTION 'your role cannot review approvals' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT a.id, a.state, a.created_at, a.expires_at, r.id, r.status, ag.id, ag.name, e.name, r.action_key, r.resource,
           r.canonical_digest, r.parameters_ciphertext, r.parameters_key_id, a.policy_epoch, e.policy_epoch,
           a.decided_by_user_id, a.decided_at, a.decision_comment, r.parameters_purged_at IS NOT NULL,
           r.originating_credential_id
      FROM axo.approval_requests a
      JOIN axo.action_requests r ON r.organization_id = a.organization_id AND r.id = a.action_request_id
      JOIN axo.agents ag ON ag.organization_id = r.organization_id AND ag.id = r.agent_id
      JOIN axo.environments e ON e.organization_id = r.organization_id AND e.id = r.environment_id
     WHERE a.id = p_approval AND a.organization_id = axo.current_org();
END
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Trusted executor
-- ---------------------------------------------------------------------------------------------------------------

-- Step 1 of a claim (same transaction as step 2). Picks the oldest open grant, takes every lock in the global order,
-- sets the context row-level security needs so the executor can read the applicable policies, and returns a snapshot
-- of everything the executor must re-check. Returns no row when there is nothing (or nothing safe) to claim.
CREATE FUNCTION axo.claim_lock_next(p_executor text)
  RETURNS TABLE (grant_id uuid, request_id uuid, organization_id uuid, agent_id uuid, environment_id uuid,
                 credential_id uuid, action_key text, resource text, digest text, ciphertext bytea, key_id text,
                 agent_status text, environment_state text, policy_epoch bigint, credential_state text,
                 grant_expired boolean, approval_state text, approval_digest text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  c record;
  v_grant uuid;
BEGIN
  IF p_executor IS NULL OR char_length(p_executor) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'invalid executor id' USING ERRCODE = '22023';
  END IF;
  SELECT g.id AS gid, r.id AS rid, r.organization_id AS org, r.agent_id AS agent, r.environment_id AS env,
         r.originating_credential_id AS cred
    INTO c
    FROM axo.execution_grants g
    JOIN axo.action_requests r ON r.organization_id = g.organization_id AND r.id = g.action_request_id
   WHERE g.consumed_at IS NULL AND g.invalidated_at IS NULL AND r.status = 'queued_execution'
   ORDER BY g.created_at LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM 1 FROM axo.environments e WHERE e.organization_id = c.org AND e.id = c.env FOR SHARE;
  PERFORM 1 FROM axo.agents a WHERE a.organization_id = c.org AND a.id = c.agent FOR SHARE;
  PERFORM 1 FROM axo.agent_credentials k WHERE k.id = c.cred FOR SHARE;
  PERFORM 1 FROM axo.approval_requests ap WHERE ap.organization_id = c.org AND ap.action_request_id = c.rid FOR UPDATE;
  PERFORM 1 FROM axo.action_requests r WHERE r.organization_id = c.org AND r.id = c.rid AND r.status = 'queued_execution' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT g.id INTO v_grant FROM axo.execution_grants g
   WHERE g.id = c.gid AND g.consumed_at IS NULL AND g.invalidated_at IS NULL FOR UPDATE SKIP LOCKED;
  IF v_grant IS NULL THEN RETURN; END IF;

  PERFORM set_config('app.organization_id', c.org::text, true);
  PERFORM set_config('app.agent_id', c.agent::text, true);
  PERFORM set_config('app.environment_id', c.env::text, true);
  PERFORM set_config('app.user_id', '', true);

  RETURN QUERY
    SELECT v_grant, r.id, r.organization_id, r.agent_id, r.environment_id, r.originating_credential_id, r.action_key,
           r.resource, r.canonical_digest, r.parameters_ciphertext, r.parameters_key_id,
           a.status, e.enforcement_state, e.policy_epoch,
           CASE WHEN k.revoked_at IS NOT NULL THEN 'revoked'
                WHEN k.expires_at IS NOT NULL AND k.expires_at <= clock_timestamp() THEN 'expired'
                ELSE 'usable' END,
           g.expires_at <= clock_timestamp(), ap.state, ap.reviewed_digest
      FROM axo.action_requests r
      JOIN axo.agents a ON a.organization_id = r.organization_id AND a.id = r.agent_id
      JOIN axo.environments e ON e.organization_id = r.organization_id AND e.id = r.environment_id
      JOIN axo.agent_credentials k ON k.id = r.originating_credential_id
      JOIN axo.execution_grants g ON g.id = v_grant
      LEFT JOIN axo.approval_requests ap ON ap.organization_id = r.organization_id AND ap.action_request_id = r.id
     WHERE r.organization_id = c.org AND r.id = c.rid;
END
$$;

-- Step 2. Decides, under the locks from step 1, whether the claim proceeds. The policy result is computed by the
-- executor's code (the same pure evaluator as the agent API); EVERYTHING ELSE is re-read here. Either the grant is
-- consumed and an attempt starts (all atomically), or the grant is invalidated and the request is closed with the
-- reason. A grant is therefore used at most once, and a stale approval cannot execute.
CREATE FUNCTION axo.claim_finish(p_grant uuid, p_executor text, p_policy_result text, p_policy_epoch bigint, p_digest_ok boolean)
  RETURNS TABLE (outcome text, attempt_id uuid, reason_code text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  g axo.execution_grants%ROWTYPE;
  r axo.action_requests%ROWTYPE;
  ap axo.approval_requests%ROWTYPE;
  v_agent text;
  v_env_state text;
  v_epoch bigint;
  v_cred text;
  v_reason text;
  v_basis text;
  v_to text := 'denied';
  v_attempt uuid;
BEGIN
  SELECT * INTO g FROM axo.execution_grants x WHERE x.id = p_grant FOR UPDATE;
  IF NOT FOUND OR g.consumed_at IS NOT NULL OR g.invalidated_at IS NOT NULL THEN
    RETURN QUERY SELECT 'gone'::text, NULL::uuid, NULL::text; RETURN;
  END IF;
  SELECT * INTO r FROM axo.action_requests x WHERE x.organization_id = g.organization_id AND x.id = g.action_request_id FOR UPDATE;
  IF r.status <> 'queued_execution' THEN
    UPDATE axo.execution_grants x SET invalidated_at = clock_timestamp(), invalidated_reason = 'request_not_queued' WHERE x.id = g.id;
    RETURN QUERY SELECT 'gone'::text, NULL::uuid, NULL::text; RETURN;
  END IF;
  SELECT a.status INTO v_agent FROM axo.agents a WHERE a.organization_id = r.organization_id AND a.id = r.agent_id;
  SELECT e.enforcement_state, e.policy_epoch INTO v_env_state, v_epoch
    FROM axo.environments e WHERE e.organization_id = r.organization_id AND e.id = r.environment_id;
  SELECT CASE WHEN k.revoked_at IS NOT NULL THEN 'revoked'
              WHEN k.expires_at IS NOT NULL AND k.expires_at <= clock_timestamp() THEN 'expired' ELSE 'usable' END
    INTO v_cred FROM axo.agent_credentials k WHERE k.id = r.originating_credential_id;
  SELECT * INTO ap FROM axo.approval_requests x WHERE x.action_request_id = r.id;

  IF g.expires_at <= clock_timestamp() THEN v_reason := 'GRANT_EXPIRED'; v_basis := 'grant_expired'; v_to := 'expired';
  ELSIF NOT coalesce(p_digest_ok, false) THEN v_reason := 'DIGEST_MISMATCH'; v_basis := 'digest_mismatch';
  ELSIF v_agent IS DISTINCT FROM 'active' THEN v_reason := 'AGENT_SUSPENDED'; v_basis := 'agent_suspended';
  ELSIF v_cred IS DISTINCT FROM 'usable' THEN v_reason := 'CREDENTIAL_REVOKED'; v_basis := 'credential_revoked';
  ELSIF v_env_state IS DISTINCT FROM 'active' THEN v_reason := 'ENVIRONMENT_HALTED'; v_basis := 'environment_halted';
  ELSIF p_policy_epoch IS DISTINCT FROM v_epoch THEN v_reason := 'POLICY_CHANGED'; v_basis := 'policy_changed';
  ELSIF ap.id IS NOT NULL AND (ap.state <> 'approved' OR ap.reviewed_digest IS DISTINCT FROM r.canonical_digest) THEN
    v_reason := 'APPROVAL_DENIED'; v_basis := 'approval_rejected';
  ELSIF p_policy_result = 'error' THEN v_reason := 'EVALUATOR_ERROR'; v_basis := 'evaluator_error';
  ELSIF p_policy_result = 'deny' THEN v_reason := 'POLICY_CHANGED'; v_basis := 'policy_changed';
  ELSIF p_policy_result = 'require_approval' AND ap.id IS NULL THEN v_reason := 'POLICY_CHANGED'; v_basis := 'policy_changed';
  ELSIF p_policy_result NOT IN ('allow', 'require_approval') THEN v_reason := 'EVALUATOR_ERROR'; v_basis := 'evaluator_error';
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE axo.execution_grants x SET invalidated_at = clock_timestamp(), invalidated_reason = lower(v_reason) WHERE x.id = g.id;
    UPDATE axo.action_requests x SET status = v_to WHERE x.id = r.id;
    INSERT INTO axo.decisions (organization_id, action_request_id, result, reason_code, basis, policy_epoch)
    VALUES (r.organization_id, r.id, 'deny', v_reason, v_basis, coalesce(v_epoch, 0));
    PERFORM axo.audit_write(r.organization_id, 'system', NULL, 'execution.blocked', 'action_request', r.id, r.id,
                            jsonb_build_object('reason_code', v_reason, 'executor', p_executor));
    RETURN QUERY SELECT 'blocked'::text, NULL::uuid, v_reason; RETURN;
  END IF;

  UPDATE axo.execution_grants x SET consumed_at = clock_timestamp() WHERE x.id = g.id;
  UPDATE axo.action_requests x SET status = 'running' WHERE x.id = r.id;
  INSERT INTO axo.execution_attempts (organization_id, grant_id, action_request_id, executor_id, connector)
  VALUES (r.organization_id, g.id, r.id, p_executor, 'mock_crm') RETURNING id INTO v_attempt;
  PERFORM axo.audit_write(r.organization_id, 'system', NULL, 'grant.claimed', 'grant', g.id, r.id,
                          jsonb_build_object('executor', p_executor));
  PERFORM axo.audit_write(r.organization_id, 'system', NULL, 'execution.started', 'action_request', r.id, r.id,
                          jsonb_build_object('executor', p_executor, 'attempt', v_attempt::text));
  RETURN QUERY SELECT 'claimed'::text, v_attempt, NULL::text;
END
$$;

-- Records the result of an attempt. Succeeded / failed / unknown are three different facts. Only the executor that
-- started the attempt can finish it, and only once.
CREATE FUNCTION axo.record_execution_result(p_attempt uuid, p_executor text, p_outcome text, p_external text, p_error text)
  RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  a axo.execution_attempts%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('succeeded', 'failed', 'unknown') THEN RAISE EXCEPTION 'unknown outcome' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM axo.execution_attempts x WHERE x.id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt not found' USING ERRCODE = 'P0002'; END IF;
  IF a.state <> 'started' OR a.executor_id <> p_executor THEN RETURN 'not_started'; END IF;
  PERFORM 1 FROM axo.action_requests r WHERE r.organization_id = a.organization_id AND r.id = a.action_request_id FOR UPDATE;
  UPDATE axo.execution_attempts x SET state = p_outcome, finished_at = clock_timestamp(),
         external_reference = left(p_external, 128), error_class = left(p_error, 64) WHERE x.id = a.id;
  UPDATE axo.action_requests r SET status = p_outcome WHERE r.id = a.action_request_id AND r.status = 'running';
  PERFORM axo.audit_write(a.organization_id, 'system', NULL, 'execution.' || p_outcome, 'action_request',
                          a.action_request_id, a.action_request_id,
                          jsonb_build_object('attempt', a.id::text, 'error_class', left(p_error, 64)));
  RETURN 'recorded';
END
$$;

-- An executor that died mid-attempt leaves an attempt in 'started'. After the cut-off it is closed as UNKNOWN. It is
-- never retried: the downstream side effect may or may not have happened.
CREATE FUNCTION axo.sweep_stuck_attempts(p_older_than_seconds integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  a record;
  v_count integer := 0;
BEGIN
  IF p_older_than_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'invalid cut-off' USING ERRCODE = '22023'; END IF;
  FOR a IN SELECT x.id, x.organization_id, x.action_request_id FROM axo.execution_attempts x
            WHERE x.state = 'started' AND x.started_at < clock_timestamp() - make_interval(secs => p_older_than_seconds)
            ORDER BY x.started_at FOR UPDATE SKIP LOCKED LOOP
    UPDATE axo.execution_attempts x SET state = 'unknown', finished_at = clock_timestamp(), error_class = 'executor_lost' WHERE x.id = a.id;
    UPDATE axo.action_requests r SET status = 'unknown' WHERE r.id = a.action_request_id AND r.status = 'running';
    PERFORM axo.audit_write(a.organization_id, 'system', NULL, 'execution.unknown', 'action_request', a.action_request_id,
                            a.action_request_id, jsonb_build_object('attempt', a.id::text, 'error_class', 'executor_lost'));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$$;

-- Marks approvals that were never decided, and grants that were never claimed, as expired. Correctness never depends
-- on this running (every read and the claim itself check the clock); it keeps the stored state honest.
CREATE FUNCTION axo.expire_stale() RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  x record;
  v_count integer := 0;
BEGIN
  FOR x IN SELECT a.id, a.organization_id, a.action_request_id FROM axo.approval_requests a
            WHERE a.state = 'pending' AND a.expires_at <= clock_timestamp() ORDER BY a.expires_at FOR UPDATE SKIP LOCKED LOOP
    UPDATE axo.approval_requests a SET state = 'expired', decided_at = clock_timestamp() WHERE a.id = x.id;
    UPDATE axo.action_requests r SET status = 'expired' WHERE r.id = x.action_request_id AND r.status = 'pending_approval';
    PERFORM axo.audit_write(x.organization_id, 'system', NULL, 'approval.expired', 'approval', x.id, x.action_request_id, '{}');
    v_count := v_count + 1;
  END LOOP;
  FOR x IN SELECT g.id, g.organization_id, g.action_request_id FROM axo.execution_grants g
            WHERE g.consumed_at IS NULL AND g.invalidated_at IS NULL AND g.expires_at <= clock_timestamp()
            ORDER BY g.expires_at FOR UPDATE SKIP LOCKED LOOP
    UPDATE axo.execution_grants g SET invalidated_at = clock_timestamp(), invalidated_reason = 'expired' WHERE g.id = x.id;
    UPDATE axo.action_requests r SET status = 'expired' WHERE r.id = x.action_request_id AND r.status = 'queued_execution';
    PERFORM axo.audit_write(x.organization_id, 'system', NULL, 'grant.expired', 'grant', x.id, x.action_request_id, '{}');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$$;

-- Retention (docs/BE-02-DECISIONS.md D10): erase the encrypted parameters of requests that finished long enough ago.
-- The digest, the decision and the audit trail stay.
CREATE FUNCTION axo.purge_parameters(p_retention_days integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_retention_days NOT BETWEEN 1 AND 3650 THEN RAISE EXCEPTION 'invalid retention' USING ERRCODE = '22023'; END IF;
  WITH purged AS (
    UPDATE axo.action_requests r SET parameters_ciphertext = NULL, parameters_purged_at = clock_timestamp()
     WHERE r.parameters_ciphertext IS NOT NULL
       AND r.status IN ('denied', 'expired', 'succeeded', 'failed', 'unknown')
       AND r.updated_at < clock_timestamp() - make_interval(days => p_retention_days)
    RETURNING r.organization_id, r.id
  ), logged AS (
    INSERT INTO axo.audit_events (organization_id, actor_type, event_type, object_type, object_id, request_id, metadata)
    SELECT p.organization_id, 'system', 'action_request.parameters_purged', 'action_request', p.id, p.id, '{}' FROM purged p
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM purged;
  RETURN v_count;
END
$$;

-- Deletes stale operational rows: ended sessions (30 days), login transactions, old invitations, rate-limit counters.
CREATE FUNCTION axo.cleanup_expired() RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_total integer := 0;
  v_n integer;
BEGIN
  DELETE FROM axo.sessions s WHERE least(s.absolute_expires_at, coalesce(s.revoked_at, s.absolute_expires_at)) < clock_timestamp() - interval '30 days';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM axo.oidc_transactions t WHERE t.expires_at < clock_timestamp() - interval '1 day';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM axo.invitations i WHERE i.expires_at < clock_timestamp() - interval '30 days' AND i.accepted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM axo.rate_limit_counters c WHERE c.window_start < clock_timestamp() - interval '1 day';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  RETURN v_total;
END
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION
  axo.decide_approval(uuid, text, text, text),
  axo.review_approval(uuid),
  axo.withdraw_requests(uuid, uuid, text, text)
  TO axo_management;
GRANT EXECUTE ON FUNCTION
  axo.claim_lock_next(text),
  axo.claim_finish(uuid, text, text, bigint, boolean),
  axo.record_execution_result(uuid, text, text, text, text),
  axo.sweep_stuck_attempts(integer),
  axo.expire_stale(),
  axo.purge_parameters(integer),
  axo.cleanup_expired()
  TO axo_executor;

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p WHERE p.pronamespace = 'axo'::regnamespace LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.signature);
  END LOOP;
END
$$;
