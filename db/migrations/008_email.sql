-- Email (Resend): address verification, password reset, and an outbox for notifications.
-- Nothing here is ever deleted: tokens are marked used, outbox rows keep their final status.

-- Accounts that existed before email verification are trusted as-is.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- One-time links. Only the sha256 of the token is stored; the raw token lives in the email alone.
CREATE TABLE email_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  purpose     text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  token_hash  text NOT NULL UNIQUE,
  email       citext NOT NULL,                 -- address the link was sent to
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_tokens_user_idx ON email_tokens(user_id, purpose);
CREATE TRIGGER email_tokens_no_delete   BEFORE DELETE   ON email_tokens FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER email_tokens_no_truncate BEFORE TRUNCATE ON email_tokens FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();

-- Every email the platform sends (or tried to). Notification rows are queued inside the same
-- transaction as the event that caused them, then dispatched; dedupe_key makes each one send once.
-- Token emails (verify/reset) are logged here too, with params that never contain the token.
CREATE TABLE email_outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id),
  to_email     citext NOT NULL,
  template     text NOT NULL,
  params       jsonb NOT NULL DEFAULT '{}',
  dedupe_key   text UNIQUE,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  attempts     int  NOT NULL DEFAULT 0,
  provider_id  text,
  error        text,
  send_after   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
CREATE INDEX email_outbox_queue_idx ON email_outbox(send_after) WHERE status = 'queued';
CREATE INDEX email_outbox_created_idx ON email_outbox(created_at DESC);
CREATE TRIGGER email_outbox_no_delete   BEFORE DELETE   ON email_outbox FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER email_outbox_no_truncate BEFORE TRUNCATE ON email_outbox FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();
