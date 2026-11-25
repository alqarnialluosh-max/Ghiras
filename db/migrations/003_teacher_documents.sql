-- Teacher CVs (and future documents). Stored inside Postgres so they are covered
-- by the same backups and the same never-delete protection. Replacing a CV adds
-- a new row; the latest one is "current", older ones stay as history.
CREATE TABLE teacher_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid NOT NULL REFERENCES users(id),
  kind        text NOT NULL DEFAULT 'cv' CHECK (kind IN ('cv')),
  filename    text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 200),
  mime        text NOT NULL CHECK (mime IN ('application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg', 'image/png')),
  size_bytes  int  NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256      text NOT NULL,
  data        bytea NOT NULL,
  uploaded_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teacher_documents_teacher_idx ON teacher_documents(teacher_id, kind, created_at DESC);

CREATE TRIGGER teacher_documents_no_delete   BEFORE DELETE   ON teacher_documents FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER teacher_documents_no_truncate BEFORE TRUNCATE ON teacher_documents FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER teacher_documents_no_update   BEFORE UPDATE   ON teacher_documents FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_update();
