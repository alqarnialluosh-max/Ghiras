-- Post-signup survey (one per parent; can be updated, never deleted)
CREATE TABLE onboarding_surveys (
  user_id            uuid PRIMARY KEY REFERENCES users(id),
  source             text NOT NULL,
  source_other       text,
  goal               text NOT NULL,
  goal_other         text,
  needs              text[] NOT NULL DEFAULT '{}',
  needs_other        text,
  expectations       text[] NOT NULL DEFAULT '{}',
  expectation_other  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_surveys_source_idx ON onboarding_surveys(source);
CREATE TRIGGER onboarding_surveys_touch BEFORE UPDATE ON onboarding_surveys FOR EACH ROW EXECUTE FUNCTION ghiras_touch_updated_at();
CREATE TRIGGER onboarding_surveys_no_delete   BEFORE DELETE   ON onboarding_surveys FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER onboarding_surveys_no_truncate BEFORE TRUNCATE ON onboarding_surveys FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();

-- Parent chose "later": remember so we don't nag on every visit
ALTER TABLE users ADD COLUMN survey_skipped_at timestamptz;

-- Structured (optional) post-session report written by the teacher
ALTER TABLE bookings ADD COLUMN report jsonb;
