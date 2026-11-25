-- Salla store connection (Salla Partners app, Easy Mode).
-- Tokens are AES-256-GCM encrypted by the app before they reach the database.
-- One row per authorization; the newest non-revoked row is the active one.
CREATE TABLE salla_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        text NOT NULL,
  store_name         text,
  access_token_enc   text NOT NULL,
  refresh_token_enc  text NOT NULL,
  expires_at         timestamptz NOT NULL,
  scope              text,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  refreshed_at       timestamptz,
  revoked_at         timestamptz,
  revoke_reason      text
);
CREATE INDEX salla_connections_active_idx ON salla_connections(connected_at DESC) WHERE revoked_at IS NULL;
CREATE TRIGGER salla_connections_no_delete   BEFORE DELETE   ON salla_connections FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER salla_connections_no_truncate BEFORE TRUNCATE ON salla_connections FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();

-- What we told Salla, and what Salla answered (status updates, syncs)
CREATE TABLE salla_api_log (
  id          bigserial PRIMARY KEY,
  action      text NOT NULL,            -- refresh | order_status | sync | test | products
  order_id    text,
  ok          boolean NOT NULL,
  http_status int,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX salla_api_log_created_idx ON salla_api_log(created_at DESC);
CREATE TRIGGER salla_api_log_no_delete BEFORE DELETE ON salla_api_log FOR EACH ROW EXECUTE FUNCTION ghiras_forbid_delete();

-- Track whether we already pushed "completed" back to Salla for an order
ALTER TABLE subscriptions ADD COLUMN salla_status_synced_at timestamptz;

INSERT INTO settings (key, value) VALUES
  ('salla_complete_status', 'completed'),   -- slug to set after activation ('' = don't update)
  ('salla_last_sync', '')
ON CONFLICT (key) DO NOTHING;
