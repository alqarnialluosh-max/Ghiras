-- Google Meet: the owner links a Google Workspace account once (OAuth); each session then gets its own Meet space.

CREATE TABLE google_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              citext NOT NULL,
  refresh_token_enc  text NOT NULL,                 -- AES-256-GCM, same as other secrets
  scopes             text NOT NULL,
  connected_by       uuid NOT NULL REFERENCES users(id),
  connected_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  revoke_reason      text
);
CREATE UNIQUE INDEX google_connections_one_active ON google_connections ((true)) WHERE revoked_at IS NULL;
CREATE TRIGGER google_connections_no_delete   BEFORE DELETE   ON google_connections FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER google_connections_no_truncate BEFORE TRUNCATE ON google_connections FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();

-- Which service made the session's link (teams_link / teams_event_id now hold any provider's link / id)
ALTER TABLE bookings ADD COLUMN meeting_provider text CHECK (meeting_provider IN ('google', 'teams'));
UPDATE bookings SET meeting_provider = 'teams' WHERE teams_source = 'auto';

-- A teacher's permanent link may be Teams or Google Meet
ALTER TABLE teacher_profiles DROP CONSTRAINT IF EXISTS teacher_profiles_teams_link_check;
ALTER TABLE teacher_profiles ADD CONSTRAINT teacher_profiles_teams_link_check
  CHECK (teams_link IS NULL OR teams_link ~ '^https://(teams\.microsoft\.com|teams\.live\.com|meet\.google\.com)/');
