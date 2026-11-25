-- Automatic Microsoft Teams meetings (one per booking) via the Ghiras organizer calendar.
ALTER TABLE bookings ADD COLUMN teams_event_id text;                       -- Graph event id
ALTER TABLE bookings ADD COLUMN teams_source   text NOT NULL DEFAULT 'teacher_link'
  CHECK (teams_source IN ('teacher_link', 'auto', 'pending'));
ALTER TABLE bookings ADD COLUMN teams_attempts smallint NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN teams_error    text;
CREATE INDEX bookings_teams_pending_idx ON bookings(starts_at) WHERE teams_source = 'pending';

CREATE TABLE teams_api_log (
  id          bigserial PRIMARY KEY,
  action      text NOT NULL,          -- token | create | cancel | test
  booking_id  uuid,
  ok          boolean NOT NULL,
  http_status int,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teams_api_log_created_idx ON teams_api_log(created_at DESC);
CREATE TRIGGER teams_api_log_no_delete BEFORE DELETE ON teams_api_log FOR EACH ROW EXECUTE FUNCTION ghiras_forbid_delete();
