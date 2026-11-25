-- =====================================================================
--  غِراس — Initial schema
--  Principles:
--   1) Core data is NEVER deleted: DELETE/TRUNCATE are blocked by triggers.
--      Records are archived (archived_at) or change status instead.
--   2) Double-booking is impossible at the database level (EXCLUDE constraints)
--      for both the teacher and the student.
--   3) Audit log is append-only (no UPDATE / DELETE).
--   4) All times are timestamptz; the business runs on Asia/Riyadh (UTC+3).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- Enums ----------
CREATE TYPE user_role        AS ENUM ('parent', 'teacher', 'admin');
CREATE TYPE user_status      AS ENUM ('active', 'pending', 'suspended');
CREATE TYPE subject_code     AS ENUM ('math', 'arabic', 'science');
CREATE TYPE track_code       AS ENUM ('remedial', 'followup', 'exam_prep');
CREATE TYPE sub_status       AS ENUM ('pending_payment', 'active', 'expired', 'void');
CREATE TYPE booking_status   AS ENUM ('scheduled', 'completed', 'student_absent', 'teacher_absent', 'rescheduled');
CREATE TYPE payment_match    AS ENUM ('matched', 'unmatched', 'ignored', 'invalid_signature');

-- ---------- Guard functions ----------
CREATE OR REPLACE FUNCTION ghiras_forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GHIRAS_PROTECTED: rows in % can never be deleted (archive instead)', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ghiras_forbid_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GHIRAS_PROTECTED: rows in % are append-only', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ghiras_touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- ---------- Users ----------
CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role             user_role   NOT NULL,
  status           user_status NOT NULL DEFAULT 'active',
  full_name        text        NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  email            citext      NOT NULL UNIQUE CHECK (position('@' in email) > 1),
  phone_enc        text,                 -- AES-256-GCM ciphertext (app-level)
  phone_hash       text,                 -- HMAC-SHA256 for lookups (Salla matching)
  password_hash    text        NOT NULL,
  failed_logins    int         NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_login_at    timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_phone_hash_idx ON users(phone_hash);
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION ghiras_touch_updated_at();

-- ---------- Auth sessions (revoked, never deleted) ----------
CREATE TABLE auth_sessions (
  id          text PRIMARY KEY,          -- sha256(token) hex; raw token only lives in the cookie
  user_id     uuid NOT NULL REFERENCES users(id),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);

-- ---------- Students (children of a parent account) ----------
CREATE TABLE students (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NOT NULL REFERENCES users(id),
  full_name    text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  grade        smallint NOT NULL CHECK (grade BETWEEN 1 AND 9),  -- 1..6 primary, 7..9 intermediate
  notes_enc    text,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX students_parent_idx ON students(parent_id);
CREATE TRIGGER students_touch BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION ghiras_touch_updated_at();

-- ---------- Teacher profiles ----------
CREATE TABLE teacher_profiles (
  user_id           uuid PRIMARY KEY REFERENCES users(id),
  bio               text NOT NULL DEFAULT '',
  qualification     text NOT NULL DEFAULT '',
  years_experience  smallint NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 60),
  subjects          subject_code[] NOT NULL DEFAULT '{}',
  min_grade         smallint NOT NULL DEFAULT 1 CHECK (min_grade BETWEEN 1 AND 9),
  max_grade         smallint NOT NULL DEFAULT 9 CHECK (max_grade BETWEEN 1 AND 9),
  teams_link        text CHECK (teams_link IS NULL OR teams_link ~ '^https://(teams\.microsoft\.com|teams\.live\.com)/'),
  accepting         boolean NOT NULL DEFAULT true,
  approved_at       timestamptz,
  approved_by       uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (min_grade <= max_grade)
);
CREATE TRIGGER teacher_profiles_touch BEFORE UPDATE ON teacher_profiles FOR EACH ROW EXECUTE FUNCTION ghiras_touch_updated_at();

-- Weekly availability: editing = deactivate old row + insert new row (history kept)
CREATE TABLE availability_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES users(id),
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Sunday (JS convention)
  start_minute  smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute    smallint NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (end_minute - start_minute >= 60)
);
CREATE INDEX availability_rules_teacher_idx ON availability_rules(teacher_id) WHERE active;

CREATE TABLE availability_exceptions (       -- time off
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid NOT NULL REFERENCES users(id),
  during      tstzrange NOT NULL,
  reason      text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX availability_exceptions_idx ON availability_exceptions USING gist (teacher_id, during) WHERE active;

-- ---------- Plans ----------
CREATE TABLE plans (
  code             text PRIMARY KEY,
  name_ar          text NOT NULL,
  price_sar        numeric(10,2) NOT NULL CHECK (price_sar >= 0),
  sessions_count   smallint NOT NULL CHECK (sessions_count > 0),
  bonus_sessions   smallint NOT NULL DEFAULT 0,
  weekly_limit     smallint,                      -- NULL = no weekly limit
  duration_days    smallint NOT NULL,
  all_subjects     boolean NOT NULL DEFAULT false,
  salla_url        text,
  salla_product_id text,
  sort_order       smallint NOT NULL DEFAULT 0,
  active           boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER plans_touch BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION ghiras_touch_updated_at();

INSERT INTO plans (code, name_ar, price_sar, sessions_count, bonus_sessions, weekly_limit, duration_days, all_subjects, sort_order) VALUES
  ('ALL_SUBJECTS',   'باقة كل المواد',  599, 8, 1, 2,    30, true,  1),
  ('SINGLE_SUBJECT', 'باقة مادة واحدة', 399, 8, 0, 2,    30, false, 2),
  ('SINGLE_SESSION', 'حصة واحدة',        80, 1, 0, NULL, 14, false, 3);

-- ---------- Subscriptions ----------
CREATE TABLE subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        text NOT NULL UNIQUE,                 -- shown to the parent, e.g. GH-7K3P9Q
  parent_id        uuid NOT NULL REFERENCES users(id),
  student_id       uuid NOT NULL REFERENCES students(id),
  plan_code        text NOT NULL REFERENCES plans(code),
  subject          subject_code,                          -- NULL when plan covers all subjects
  track            track_code NOT NULL,
  status           sub_status NOT NULL DEFAULT 'pending_payment',
  price_sar        numeric(10,2) NOT NULL,                -- snapshot at purchase time
  sessions_total   smallint NOT NULL,                     -- sessions_count + bonus snapshot
  weekly_limit     smallint,
  bonus_sessions   smallint NOT NULL DEFAULT 0,
  duration_days    smallint NOT NULL,
  starts_at        timestamptz,
  ends_at          timestamptz,
  salla_order_id   text UNIQUE,
  activated_by     uuid REFERENCES users(id),             -- NULL + salla_order_id = activated by webhook
  activation_note  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'active' OR (starts_at IS NOT NULL AND ends_at IS NOT NULL))
);
CREATE INDEX subscriptions_parent_idx ON subscriptions(parent_id);
CREATE INDEX subscriptions_status_idx ON subscriptions(status);
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION ghiras_touch_updated_at();

-- ---------- Bookings ----------
CREATE TABLE bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES subscriptions(id),
  parent_id        uuid NOT NULL REFERENCES users(id),
  student_id       uuid NOT NULL REFERENCES students(id),
  teacher_id       uuid NOT NULL REFERENCES users(id),
  subject          subject_code NOT NULL,
  track            track_code NOT NULL,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  during           tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  status           booking_status NOT NULL DEFAULT 'scheduled',
  description      text NOT NULL DEFAULT '',             -- what the parent wants covered
  teams_link       text NOT NULL,                        -- snapshot of the teacher's link at booking time
  teacher_notes    text,                                 -- progress note shared with the parent
  replaced_by      uuid REFERENCES bookings(id),         -- set when rescheduled by admin
  created_by       uuid NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- A teacher can never have two live sessions overlapping
  CONSTRAINT bookings_no_teacher_overlap EXCLUDE USING gist (teacher_id WITH =, during WITH &&)
    WHERE (status <> 'rescheduled'),
  -- A student can never have two live sessions overlapping
  CONSTRAINT bookings_no_student_overlap EXCLUDE USING gist (student_id WITH =, during WITH &&)
    WHERE (status <> 'rescheduled')
);
CREATE INDEX bookings_teacher_time_idx ON bookings(teacher_id, starts_at);
CREATE INDEX bookings_parent_time_idx  ON bookings(parent_id, starts_at);
CREATE INDEX bookings_sub_idx          ON bookings(subscription_id);
CREATE TRIGGER bookings_touch BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION ghiras_touch_updated_at();

-- Core booking facts are immutable; changes happen by rescheduling (new row).
CREATE OR REPLACE FUNCTION ghiras_booking_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.starts_at <> OLD.starts_at OR NEW.ends_at <> OLD.ends_at
     OR NEW.teacher_id <> OLD.teacher_id OR NEW.student_id <> OLD.student_id
     OR NEW.subscription_id <> OLD.subscription_id OR NEW.parent_id <> OLD.parent_id THEN
    RAISE EXCEPTION 'GHIRAS_PROTECTED: booking core fields are immutable (reschedule instead)' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'rescheduled' AND NEW.status <> 'rescheduled' THEN
    RAISE EXCEPTION 'GHIRAS_PROTECTED: a rescheduled booking cannot be revived' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER bookings_immutable BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION ghiras_booking_immutable();

-- ---------- Salla payment events (raw, append-only payload) ----------
CREATE TABLE salla_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event            text NOT NULL,
  order_id         text,
  order_status     text,
  customer_email   citext,
  customer_phone_hash text,
  amount_sar       numeric(10,2),
  product_refs     text[] NOT NULL DEFAULT '{}',
  payload          jsonb NOT NULL,
  match_status     payment_match NOT NULL,
  subscription_id  uuid REFERENCES subscriptions(id),
  resolved_by      uuid REFERENCES users(id),
  received_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX salla_events_order_idx ON salla_events(order_id);
CREATE INDEX salla_events_match_idx ON salla_events(match_status);

-- ---------- Teacher payouts ----------
CREATE TABLE payouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      uuid NOT NULL REFERENCES users(id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  sessions_count  int  NOT NULL,
  rate_sar        numeric(10,2) NOT NULL,
  amount_sar      numeric(10,2) NOT NULL,
  paid_at         timestamptz NOT NULL DEFAULT now(),
  paid_by         uuid NOT NULL REFERENCES users(id),
  note            text,
  UNIQUE (teacher_id, period_start, period_end)
);

-- ---------- Audit log (append-only) ----------
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  data        jsonb NOT NULL DEFAULT '{}',
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log(entity, entity_id);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);

-- ---------- Rate limiting (operational, may be updated) ----------
CREATE TABLE rate_limits (
  key        text PRIMARY KEY,
  hits       int NOT NULL,
  reset_at   timestamptz NOT NULL
);

-- ---------- Apply the never-delete protection ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','auth_sessions','students','teacher_profiles','availability_rules',
                           'availability_exceptions','plans','subscriptions','bookings','salla_events',
                           'payouts','audit_log']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ghiras_forbid_delete()', t || '_no_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete()', t || '_no_truncate', t);
  END LOOP;
END $$;

CREATE TRIGGER audit_log_no_update   BEFORE UPDATE ON audit_log   FOR EACH ROW EXECUTE FUNCTION ghiras_forbid_update();
CREATE TRIGGER salla_events_payload_lock BEFORE UPDATE OF payload, event, order_id ON salla_events
  FOR EACH ROW EXECUTE FUNCTION ghiras_forbid_update();
