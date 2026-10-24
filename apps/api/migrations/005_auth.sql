-- 005: human authentication state, organization membership rules, invitations, rate limiting.
--
-- AgentAxio stores NO passwords. People authenticate with an OpenID Connect provider (docs/BE-02-DECISIONS.md D1).
-- This migration stores only what comes after: the user record, server-side sessions, login transactions, invitations.
--
-- Everything that touches those tables goes through SECURITY DEFINER functions with fixed search_path; the runtime
-- roles get no table privileges on them. The user id is NEVER a parameter of an authorization decision: it is set from
-- a session row by axo.enter_session and read by axo.current_user_id().
--
-- Lock order used everywhere a transaction takes more than one lock (so the lock graph has no cycles):
--   environment -> agent -> credential -> approval -> request -> grant

-- -------------------------------------------------------------------------------------------------------------
-- Credential lookup now also names the agent (not a secret). The agent API uses it to apply its per-agent rate limit
-- BEFORE it starts the locking transaction, so a request never holds a connection while waiting for another one.
-- -------------------------------------------------------------------------------------------------------------
DROP FUNCTION axo.lookup_credential(text);
CREATE FUNCTION axo.lookup_credential(p_key_id text)
  RETURNS TABLE (credential_id uuid, agent_id uuid, secret_hash bytea, hash_version smallint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT c.id, c.agent_id, c.secret_hash, c.hash_version FROM axo.agent_credentials c WHERE c.key_id = p_key_id
  $$;
GRANT EXECUTE ON FUNCTION axo.lookup_credential(text) TO axo_agent_api;

-- -------------------------------------------------------------------------------------------------------------
-- A tiny audit helper for definer functions (they run as the owner and so write the trail directly).
-- -------------------------------------------------------------------------------------------------------------
CREATE FUNCTION axo.audit_write(
  p_org uuid, p_actor_type text, p_actor uuid, p_event text, p_object_type text, p_object uuid,
  p_request uuid, p_metadata jsonb
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  INSERT INTO axo.audit_events (organization_id, actor_type, actor_id, event_type, object_type, object_id, request_id, metadata)
  VALUES (p_org, p_actor_type, p_actor, p_event, p_object_type, p_object, p_request, coalesce(p_metadata, '{}'::jsonb))
$$;
-- Not callable by any runtime role; only other definer functions use it.

-- Step-up: a fresh MFA is required for sensitive actions. Set from the session by axo.enter_session.
CREATE FUNCTION axo.step_up_ok() RETURNS boolean LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('app.mfa_fresh', true), '') = 'true' $$;
GRANT EXECUTE ON FUNCTION axo.step_up_ok() TO axo_agent_api, axo_management;

CREATE FUNCTION axo.require_step_up() RETURNS void LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT axo.step_up_ok() THEN
    RAISE EXCEPTION 'a recent multi-factor authentication is required' USING ERRCODE = 'AX001';
  END IF;
END
$$;

-- -------------------------------------------------------------------------------------------------------------
-- Users
-- -------------------------------------------------------------------------------------------------------------
ALTER TABLE axo.users
  ADD COLUMN email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN disabled_at timestamptz,
  ADD COLUMN last_login_at timestamptz;

-- -------------------------------------------------------------------------------------------------------------
-- Sessions (server-side; only the SHA-256 of the cookie token is stored)
-- -------------------------------------------------------------------------------------------------------------
CREATE TABLE axo.sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES axo.users (id),
  token_hash          bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  csrf_hash           bytea NOT NULL CHECK (octet_length(csrf_hash) = 32),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  idle_expires_at     timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  auth_time           timestamptz NOT NULL,
  mfa_verified_at     timestamptz,
  amr                 text[] NOT NULL DEFAULT '{}',
  revoked_at          timestamptz,
  CHECK (absolute_expires_at > created_at)
);
CREATE INDEX sessions_user_active_idx ON axo.sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_cleanup_idx ON axo.sessions (absolute_expires_at);
ALTER TABLE axo.sessions ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION axo.login_user(p_issuer text, p_subject text, p_email text, p_email_verified boolean)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_id uuid;
  v_disabled timestamptz;
BEGIN
  IF p_issuer IS NULL OR p_subject IS NULL OR char_length(p_issuer) > 255 OR char_length(p_subject) > 255 THEN
    RAISE EXCEPTION 'invalid identity' USING ERRCODE = '22023';
  END IF;
  INSERT INTO axo.users (auth_issuer, auth_subject, email, email_verified, last_login_at)
  VALUES (p_issuer, p_subject, lower(nullif(p_email, '')), coalesce(p_email_verified, false), clock_timestamp())
  ON CONFLICT (auth_issuer, auth_subject) DO UPDATE
    SET email = EXCLUDED.email, email_verified = EXCLUDED.email_verified, last_login_at = clock_timestamp()
  RETURNING id, disabled_at INTO v_id, v_disabled;
  IF v_disabled IS NOT NULL THEN
    RAISE EXCEPTION 'this account is disabled' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END
$$;

-- At most 10 live sessions per user; older ones are revoked. A new token never reuses an old one (no fixation).
CREATE FUNCTION axo.create_session(
  p_user uuid, p_token_hash bytea, p_csrf_hash bytea, p_auth_time timestamptz, p_amr text[], p_mfa boolean,
  p_idle_seconds integer, p_absolute_seconds integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_id uuid;
  v_now timestamptz := clock_timestamp();
  v_auth timestamptz := least(coalesce(p_auth_time, v_now), v_now);
BEGIN
  IF p_idle_seconds NOT BETWEEN 60 AND 86400 OR p_absolute_seconds NOT BETWEEN 300 AND 2592000 THEN
    RAISE EXCEPTION 'invalid session lifetime' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM axo.users u WHERE u.id = p_user AND u.disabled_at IS NULL) THEN
    RAISE EXCEPTION 'unknown or disabled user' USING ERRCODE = '42501';
  END IF;
  INSERT INTO axo.sessions (user_id, token_hash, csrf_hash, created_at, last_seen_at, idle_expires_at,
                            absolute_expires_at, auth_time, mfa_verified_at, amr)
  VALUES (p_user, p_token_hash, p_csrf_hash, v_now, v_now,
          least(v_now + make_interval(secs => p_idle_seconds), v_now + make_interval(secs => p_absolute_seconds)),
          v_now + make_interval(secs => p_absolute_seconds), v_auth,
          CASE WHEN p_mfa THEN v_auth END, coalesce(p_amr, '{}'))
  RETURNING id INTO v_id;
  UPDATE axo.sessions s SET revoked_at = v_now
   WHERE s.user_id = p_user AND s.revoked_at IS NULL
     AND s.id NOT IN (SELECT x.id FROM axo.sessions x WHERE x.user_id = p_user AND x.revoked_at IS NULL
                       ORDER BY x.created_at DESC LIMIT 10);
  RETURN v_id;
END
$$;

CREATE FUNCTION axo.revoke_session(p_token_hash bytea) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH r AS (UPDATE axo.sessions SET revoked_at = clock_timestamp() WHERE token_hash = p_token_hash AND revoked_at IS NULL RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM r)
$$;

-- The only way a human request acquires an identity. Validates the session (not revoked, not idle-expired, not
-- past its absolute lifetime, user not disabled), slides the idle timer at most once a minute, and sets the
-- transaction-local identity that every later check reads. Raises insufficient_privilege otherwise.
CREATE FUNCTION axo.enter_session(p_token_hash bytea, p_idle_seconds integer)
  RETURNS TABLE (user_id uuid, session_id uuid, mfa_fresh boolean, csrf_hash bytea)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  s axo.sessions%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_fresh boolean;
BEGIN
  SELECT * INTO s FROM axo.sessions x WHERE x.token_hash = p_token_hash;
  IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.idle_expires_at <= v_now OR s.absolute_expires_at <= v_now
     OR NOT EXISTS (SELECT 1 FROM axo.users u WHERE u.id = s.user_id AND u.disabled_at IS NULL) THEN
    RAISE EXCEPTION 'no valid session' USING ERRCODE = '42501';
  END IF;
  IF s.last_seen_at < v_now - interval '60 seconds' THEN
    UPDATE axo.sessions x SET last_seen_at = v_now,
           idle_expires_at = least(v_now + make_interval(secs => p_idle_seconds), x.absolute_expires_at)
     WHERE x.id = s.id;
  END IF;
  v_fresh := s.mfa_verified_at IS NOT NULL AND s.mfa_verified_at > v_now - interval '15 minutes';
  PERFORM set_config('app.user_id', s.user_id::text, true);
  PERFORM set_config('app.session_id', s.id::text, true);
  PERFORM set_config('app.mfa_fresh', CASE WHEN v_fresh THEN 'true' ELSE 'false' END, true);
  PERFORM set_config('app.organization_id', '', true);
  PERFORM set_config('app.agent_id', '', true);
  PERFORM set_config('app.environment_id', '', true);
  RETURN QUERY SELECT s.user_id, s.id, v_fresh, s.csrf_hash;
END
$$;

-- Choose an organization. Membership of the SESSION's user is proven here; the organization id the client names is
-- only a request to enter it.
CREATE FUNCTION axo.enter_org(p_org uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_role text;
BEGIN
  IF axo.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT m.role INTO v_role FROM axo.memberships m
   WHERE m.organization_id = p_org AND m.user_id = axo.current_user_id() AND m.status = 'active';
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not an active member of the organization' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.organization_id', p_org::text, true);
  RETURN v_role;
END
$$;

-- The M01 entry point took a user id from the caller. It is gone: identity now comes only from a session.
DROP FUNCTION axo.enter_management_context(uuid, uuid);

-- -------------------------------------------------------------------------------------------------------------
-- OpenID Connect login transactions (state / nonce / PKCE verifier, single use, short-lived)
-- -------------------------------------------------------------------------------------------------------------
CREATE TABLE axo.oidc_transactions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash               bytea NOT NULL UNIQUE CHECK (octet_length(state_hash) = 32),
  browser_hash             bytea NOT NULL CHECK (octet_length(browser_hash) = 32),
  nonce                    text NOT NULL CHECK (char_length(nonce) BETWEEN 16 AND 128),
  code_verifier_ciphertext bytea NOT NULL,
  key_id                   text NOT NULL,
  return_to                text NOT NULL DEFAULT '/dashboard' CHECK (return_to ~ '^/[A-Za-z0-9/_?=&.-]{0,200}$'),
  step_up                  boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz NOT NULL,
  consumed_at              timestamptz
);
ALTER TABLE axo.oidc_transactions ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION axo.start_login(
  p_state_hash bytea, p_browser_hash bytea, p_nonce text, p_verifier bytea, p_key_id text, p_return_to text,
  p_step_up boolean, p_ttl_seconds integer
) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  INSERT INTO axo.oidc_transactions (state_hash, browser_hash, nonce, code_verifier_ciphertext, key_id, return_to, step_up, expires_at)
  VALUES (p_state_hash, p_browser_hash, p_nonce, p_verifier, p_key_id, p_return_to, p_step_up,
          clock_timestamp() + make_interval(secs => least(greatest(p_ttl_seconds, 30), 900)))
  RETURNING id
$$;

-- Single use: the first caller wins and consumes it; a replayed state, a different browser, or an expired one gets
-- nothing. The browser binding stops "login CSRF" (an attacker completing their own flow in a victim's browser).
CREATE FUNCTION axo.finish_login(p_state_hash bytea, p_browser_hash bytea)
  RETURNS TABLE (nonce text, verifier bytea, key_id text, return_to text, step_up boolean)
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  UPDATE axo.oidc_transactions t SET consumed_at = clock_timestamp()
   WHERE t.state_hash = p_state_hash AND t.browser_hash = p_browser_hash
     AND t.consumed_at IS NULL AND t.expires_at > clock_timestamp()
  RETURNING t.nonce, t.code_verifier_ciphertext, t.key_id, t.return_to, t.step_up
$$;

-- -------------------------------------------------------------------------------------------------------------
-- Identity read model for the signed-in user
-- -------------------------------------------------------------------------------------------------------------
CREATE FUNCTION axo.whoami()
  RETURNS TABLE (user_id uuid, email text, email_verified boolean, organization_id uuid, organization_name text,
                 organization_slug text, role text)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF axo.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, u.email_verified, o.id, o.name, o.slug, m.role
      FROM axo.users u
      LEFT JOIN axo.memberships m ON m.user_id = u.id AND m.status = 'active'
      LEFT JOIN axo.organizations o ON o.id = m.organization_id
     WHERE u.id = axo.current_user_id()
     ORDER BY o.name;
END
$$;

-- -------------------------------------------------------------------------------------------------------------
-- Organizations and membership
-- -------------------------------------------------------------------------------------------------------------
CREATE FUNCTION axo.create_organization(p_name text, p_slug text) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_user uuid := axo.current_user_id();
  v_org uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  PERFORM axo.require_step_up();
  IF NOT EXISTS (SELECT 1 FROM axo.users u WHERE u.id = v_user AND u.email_verified) THEN
    RAISE EXCEPTION 'a verified email address is required' USING ERRCODE = '42501';
  END IF;
  -- Serialize one user's creations so the cap cannot be beaten by parallel requests.
  PERFORM pg_advisory_xact_lock(hashtextextended('axo.create_org:' || v_user::text, 0));
  IF (SELECT count(*) FROM axo.memberships m WHERE m.user_id = v_user AND m.role = 'owner' AND m.status = 'active') >= 3 THEN
    RAISE EXCEPTION 'organization limit reached' USING ERRCODE = 'AX002';
  END IF;
  INSERT INTO axo.organizations (name, slug) VALUES (p_name, p_slug) RETURNING id INTO v_org;
  INSERT INTO axo.environments (organization_id, name) VALUES (v_org, 'dev'), (v_org, 'prod');
  INSERT INTO axo.memberships (organization_id, user_id, role) VALUES (v_org, v_user, 'owner');
  PERFORM axo.audit_write(v_org, 'user', v_user, 'organization.created', 'organization', v_org, NULL, '{}');
  RETURN v_org;
END
$$;

-- Role rules, enforced here so no caller can skip them:
--   * a user's role never changes by their own hand;
--   * only an owner creates, changes or removes an owner or an admin;
--   * an admin manages approvers and viewers only;
--   * the last active owner can neither be demoted nor removed.
CREATE FUNCTION axo.change_member_role(p_user uuid, p_role text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_org uuid := axo.current_org();
  v_actor uuid := axo.current_user_id();
  v_actor_role text;
  v_target_role text;
BEGIN
  IF v_org IS NULL OR v_actor IS NULL THEN RAISE EXCEPTION 'no context' USING ERRCODE = '42501'; END IF;
  PERFORM axo.require_step_up();
  IF p_role NOT IN ('owner', 'admin', 'approver', 'viewer') THEN RAISE EXCEPTION 'unknown role' USING ERRCODE = '22023'; END IF;
  IF p_user = v_actor THEN RAISE EXCEPTION 'you cannot change your own role' USING ERRCODE = '42501'; END IF;
  SELECT m.role INTO v_actor_role FROM axo.memberships m WHERE m.organization_id = v_org AND m.user_id = v_actor AND m.status = 'active';
  SELECT m.role INTO v_target_role FROM axo.memberships m WHERE m.organization_id = v_org AND m.user_id = p_user AND m.status = 'active' FOR UPDATE;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'member not found' USING ERRCODE = 'P0002'; END IF;
  IF v_actor_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501'; END IF;
  IF v_actor_role = 'admin' AND (p_role IN ('owner', 'admin') OR v_target_role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'only an owner can manage owners and admins' USING ERRCODE = '42501';
  END IF;
  IF v_target_role = 'owner' AND p_role <> 'owner'
     AND (SELECT count(*) FROM axo.memberships m WHERE m.organization_id = v_org AND m.role = 'owner' AND m.status = 'active') <= 1 THEN
    RAISE EXCEPTION 'an organization needs at least one owner' USING ERRCODE = 'AX003';
  END IF;
  UPDATE axo.memberships m SET role = p_role WHERE m.organization_id = v_org AND m.user_id = p_user;
  PERFORM axo.audit_write(v_org, 'user', v_actor, 'membership.role_changed', 'user', p_user, NULL,
                          jsonb_build_object('from', v_target_role, 'to', p_role));
END
$$;

CREATE FUNCTION axo.remove_member(p_user uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_org uuid := axo.current_org();
  v_actor uuid := axo.current_user_id();
  v_actor_role text;
  v_target_role text;
BEGIN
  IF v_org IS NULL OR v_actor IS NULL THEN RAISE EXCEPTION 'no context' USING ERRCODE = '42501'; END IF;
  PERFORM axo.require_step_up();
  SELECT m.role INTO v_actor_role FROM axo.memberships m WHERE m.organization_id = v_org AND m.user_id = v_actor AND m.status = 'active';
  SELECT m.role INTO v_target_role FROM axo.memberships m WHERE m.organization_id = v_org AND m.user_id = p_user AND m.status = 'active' FOR UPDATE;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'member not found' USING ERRCODE = 'P0002'; END IF;
  IF v_actor_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501'; END IF;
  IF p_user <> v_actor AND v_actor_role = 'admin' AND v_target_role IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only an owner can remove owners and admins' USING ERRCODE = '42501';
  END IF;
  IF v_target_role = 'owner'
     AND (SELECT count(*) FROM axo.memberships m WHERE m.organization_id = v_org AND m.role = 'owner' AND m.status = 'active') <= 1 THEN
    RAISE EXCEPTION 'an organization needs at least one owner' USING ERRCODE = 'AX003';
  END IF;
  UPDATE axo.memberships m SET status = 'removed' WHERE m.organization_id = v_org AND m.user_id = p_user;
  PERFORM axo.audit_write(v_org, 'user', v_actor, 'membership.removed', 'user', p_user, NULL, jsonb_build_object('role', v_target_role));
END
$$;

CREATE FUNCTION axo.list_members()
  RETURNS TABLE (user_id uuid, email text, role text, status text, created_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF axo.current_org() IS NULL OR NOT axo.has_role(axo.current_org(), ARRAY['owner', 'admin', 'approver', 'viewer']) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.user_id, u.email, m.role, m.status, m.created_at
      FROM axo.memberships m JOIN axo.users u ON u.id = m.user_id
     WHERE m.organization_id = axo.current_org() AND m.status = 'active'
     ORDER BY m.created_at;
END
$$;

-- -------------------------------------------------------------------------------------------------------------
-- Invitations: single-use, 7-day, bound to a verified email address, token shown once to the inviter
-- -------------------------------------------------------------------------------------------------------------
CREATE TABLE axo.invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES axo.organizations (id),
  email           text NOT NULL CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  role            text NOT NULL CHECK (role IN ('owner', 'admin', 'approver', 'viewer')),
  token_hash      bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  invited_by      uuid NOT NULL REFERENCES axo.users (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  accepted_at     timestamptz,
  accepted_by     uuid REFERENCES axo.users (id),
  revoked_at      timestamptz
);
CREATE UNIQUE INDEX invitations_open_idx ON axo.invitations (organization_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
ALTER TABLE axo.invitations ENABLE ROW LEVEL SECURITY;
-- Admins and owners may list their organization's invitations (never the token hash).
GRANT SELECT (id, organization_id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at)
  ON axo.invitations TO axo_management;
CREATE POLICY invitations_read ON axo.invitations FOR SELECT TO axo_management
  USING (organization_id = axo.current_org() AND axo.has_role(organization_id, ARRAY['owner', 'admin']));

CREATE FUNCTION axo.create_invitation(p_email text, p_role text, p_token_hash bytea, p_ttl_seconds integer)
  RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_org uuid := axo.current_org();
  v_actor uuid := axo.current_user_id();
  v_actor_role text;
  v_id uuid;
BEGIN
  IF v_org IS NULL OR v_actor IS NULL THEN RAISE EXCEPTION 'no context' USING ERRCODE = '42501'; END IF;
  PERFORM axo.require_step_up();
  SELECT m.role INTO v_actor_role FROM axo.memberships m WHERE m.organization_id = v_org AND m.user_id = v_actor AND m.status = 'active';
  IF v_actor_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501'; END IF;
  IF p_role NOT IN ('owner', 'admin', 'approver', 'viewer') THEN RAISE EXCEPTION 'unknown role' USING ERRCODE = '22023'; END IF;
  IF v_actor_role = 'admin' AND p_role IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only an owner can invite owners and admins' USING ERRCODE = '42501';
  END IF;
  IF p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR char_length(p_email) > 254 THEN
    RAISE EXCEPTION 'invalid email address' USING ERRCODE = '22023';
  END IF;
  -- An older open invitation to the same address is replaced, never duplicated.
  UPDATE axo.invitations i SET revoked_at = clock_timestamp()
   WHERE i.organization_id = v_org AND i.email = lower(p_email) AND i.accepted_at IS NULL AND i.revoked_at IS NULL;
  INSERT INTO axo.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
  VALUES (v_org, lower(p_email), p_role, p_token_hash, v_actor,
          clock_timestamp() + make_interval(secs => least(greatest(p_ttl_seconds, 300), 1209600)))
  RETURNING id INTO v_id;
  PERFORM axo.audit_write(v_org, 'user', v_actor, 'invitation.created', 'invitation', v_id, NULL,
                          jsonb_build_object('role', p_role));
  RETURN v_id;
END
$$;

CREATE FUNCTION axo.revoke_invitation(p_id uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_org uuid := axo.current_org();
  v_actor uuid := axo.current_user_id();
BEGIN
  IF v_org IS NULL OR v_actor IS NULL OR NOT axo.has_role(v_org, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;
  UPDATE axo.invitations i SET revoked_at = clock_timestamp()
   WHERE i.id = p_id AND i.organization_id = v_org AND i.accepted_at IS NULL AND i.revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM axo.audit_write(v_org, 'user', v_actor, 'invitation.revoked', 'invitation', p_id, NULL, '{}');
END
$$;

-- Accepting needs only a session (no organization yet): the invitation itself names the organization. The signed-in
-- user's PROVIDER-VERIFIED email must equal the invited address; a token alone is not enough.
CREATE FUNCTION axo.accept_invitation(p_token_hash bytea) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_user uuid := axo.current_user_id();
  v_inv axo.invitations%ROWTYPE;
  v_email text;
  v_verified boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_inv FROM axo.invitations i WHERE i.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_inv.accepted_at IS NOT NULL OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'invalid invitation' USING ERRCODE = 'P0002';
  END IF;
  SELECT u.email, u.email_verified INTO v_email, v_verified FROM axo.users u WHERE u.id = v_user;
  IF NOT coalesce(v_verified, false) OR v_email IS DISTINCT FROM v_inv.email THEN
    RAISE EXCEPTION 'invalid invitation' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO axo.memberships (organization_id, user_id, role, status)
  VALUES (v_inv.organization_id, v_user, v_inv.role, 'active')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'
    WHERE axo.memberships.status = 'removed';
  IF NOT FOUND THEN RAISE EXCEPTION 'already a member' USING ERRCODE = '23505'; END IF;
  UPDATE axo.invitations i SET accepted_at = clock_timestamp(), accepted_by = v_user WHERE i.id = v_inv.id;
  PERFORM axo.audit_write(v_inv.organization_id, 'user', v_user, 'membership.created', 'user', v_user, NULL,
                          jsonb_build_object('role', v_inv.role, 'via', 'invitation'));
  RETURN v_inv.organization_id;
END
$$;

-- -------------------------------------------------------------------------------------------------------------
-- Rate limiting: shared fixed-window counters (docs/BE-02-DECISIONS.md D11). Callers hash the key first, so no
-- address or user id is stored in clear. The caller must run this OUTSIDE its main transaction so the hit survives
-- a rollback.
-- -------------------------------------------------------------------------------------------------------------
CREATE UNLOGGED TABLE axo.rate_limit_counters (
  key          text NOT NULL CHECK (key ~ '^[a-z0-9:_-]{1,128}$'),
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE axo.rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION axo.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
  RETURNS TABLE (allowed boolean, hits integer, retry_after integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_hits integer;
BEGIN
  IF p_window_seconds NOT BETWEEN 1 AND 86400 OR p_limit NOT BETWEEN 1 AND 1000000 THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;
  v_start := to_timestamp(floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds);
  INSERT INTO axo.rate_limit_counters AS c (key, window_start, hits) VALUES (p_key, v_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = c.hits + 1
  RETURNING c.hits INTO v_hits;
  RETURN QUERY SELECT v_hits <= p_limit, v_hits,
    greatest(1, ceil(extract(epoch FROM (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
END
$$;

-- Read the current window's count without counting a hit (used to refuse a client that is already over its limit
-- before doing any work for it).
CREATE FUNCTION axo.rate_limit_peek(p_key text, p_window_seconds integer) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT c.hits FROM axo.rate_limit_counters c
                    WHERE c.key = p_key
                      AND c.window_start = to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds)), 0)
$$;

-- -------------------------------------------------------------------------------------------------------------
-- Privileges: the human-facing role may call these and nothing else here.
-- -------------------------------------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION
  axo.login_user(text, text, text, boolean),
  axo.create_session(uuid, bytea, bytea, timestamptz, text[], boolean, integer, integer),
  axo.revoke_session(bytea),
  axo.enter_session(bytea, integer),
  axo.enter_org(uuid),
  axo.start_login(bytea, bytea, text, bytea, text, text, boolean, integer),
  axo.finish_login(bytea, bytea),
  axo.whoami(),
  axo.create_organization(text, text),
  axo.change_member_role(uuid, text),
  axo.remove_member(uuid),
  axo.list_members(),
  axo.create_invitation(text, text, bytea, integer),
  axo.revoke_invitation(uuid),
  axo.accept_invitation(bytea)
  TO axo_management;
GRANT EXECUTE ON FUNCTION axo.rate_limit_hit(text, integer, integer), axo.rate_limit_peek(text, integer)
  TO axo_management, axo_agent_api;

-- Sensitive writes also demand a fresh MFA in the database itself (policy RLS), independent of the API layer:
-- creating or revising a policy, and issuing a credential.
DROP POLICY policies_insert ON axo.policies;
CREATE POLICY policies_insert ON axo.policies FOR INSERT TO axo_management
  WITH CHECK (organization_id = axo.current_org() AND created_by_user_id = axo.current_user_id()
              AND axo.has_role(organization_id, ARRAY['owner', 'admin']) AND axo.step_up_ok());
DROP POLICY policy_versions_insert ON axo.policy_versions;
CREATE POLICY policy_versions_insert ON axo.policy_versions FOR INSERT TO axo_management
  WITH CHECK (organization_id = axo.current_org() AND created_by_user_id = axo.current_user_id()
              AND axo.has_role(organization_id, ARRAY['owner', 'admin']) AND axo.step_up_ok());
DROP POLICY credentials_insert ON axo.agent_credentials;
CREATE POLICY credentials_insert ON axo.agent_credentials FOR INSERT TO axo_management
  WITH CHECK (organization_id = axo.current_org() AND created_by_user_id = axo.current_user_id()
              AND axo.has_role(organization_id, ARRAY['owner', 'admin']) AND axo.step_up_ok());

-- Safety net, as in migration 004: no function in the axo schema is executable by PUBLIC.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p WHERE p.pronamespace = 'axo'::regnamespace LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.signature);
  END LOOP;
END
$$;
