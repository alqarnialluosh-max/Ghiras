-- Request / accept / propose flow. Every step is a row (never deleted); a hand-off creates a new
-- row linked by replaced_by, and all rows of one parent request share chain_id.

ALTER TABLE bookings
  ADD COLUMN respond_by          timestamptz,                 -- deadline for whoever must answer now
  ADD COLUMN proposal_stage      text CHECK (proposal_stage IN ('teacher', 'parent')),
  ADD COLUMN chain_id            uuid,
  ADD COLUMN attempt             int  NOT NULL DEFAULT 1,
  ADD COLUMN decline_kind        text CHECK (decline_kind IN ('teacher', 'timeout', 'parent', 'parent_timeout', 'no_alternative')),
  ADD COLUMN decline_reason      text,
  ADD COLUMN declined_at         timestamptz,
  ADD COLUMN decline_reviewed_at timestamptz,
  ADD COLUMN decline_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN confirmed_at        timestamptz;

UPDATE bookings SET chain_id = id, confirmed_at = created_at WHERE chain_id IS NULL;

CREATE OR REPLACE FUNCTION ghiras_booking_chain() RETURNS trigger AS $$
BEGIN
  NEW.chain_id := COALESCE(NEW.chain_id, NEW.id);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER bookings_chain BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION ghiras_booking_chain();
ALTER TABLE bookings ALTER COLUMN chain_id SET NOT NULL;

-- Dead rows (rescheduled / declined / not_taken) no longer hold the time.
ALTER TABLE bookings DROP CONSTRAINT bookings_no_teacher_overlap;
ALTER TABLE bookings DROP CONSTRAINT bookings_no_student_overlap;
ALTER TABLE bookings ADD CONSTRAINT bookings_no_teacher_overlap EXCLUDE USING gist (teacher_id WITH =, during WITH &&)
  WHERE (status NOT IN ('rescheduled', 'declined', 'not_taken'));
ALTER TABLE bookings ADD CONSTRAINT bookings_no_student_overlap EXCLUDE USING gist (student_id WITH =, during WITH &&)
  WHERE (status NOT IN ('rescheduled', 'declined', 'not_taken'));

-- A dead row can never come back to life.
CREATE OR REPLACE FUNCTION ghiras_booking_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.starts_at <> OLD.starts_at OR NEW.ends_at <> OLD.ends_at
     OR NEW.teacher_id <> OLD.teacher_id OR NEW.student_id <> OLD.student_id
     OR NEW.subscription_id <> OLD.subscription_id OR NEW.parent_id <> OLD.parent_id THEN
    RAISE EXCEPTION 'GHIRAS_PROTECTED: booking core fields are immutable (reschedule instead)' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status IN ('rescheduled', 'declined', 'not_taken') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'GHIRAS_PROTECTED: a closed booking cannot be revived' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE INDEX bookings_open_requests_idx ON bookings(respond_by) WHERE status IN ('requested', 'proposed');
CREATE INDEX bookings_chain_idx ON bookings(chain_id);
