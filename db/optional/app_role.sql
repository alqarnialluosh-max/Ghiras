-- Optional defense-in-depth: a restricted role for the running app.
-- It can read/insert/update but has NO DELETE / TRUNCATE privilege at all,
-- so even a bug or an injected query cannot remove data.
-- Run once as the database owner, then point DATABASE_URL at this role.
--   psql "$OWNER_URL" -v app_password="'...'" -f db/optional/app_role.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ghiras_app') THEN
    CREATE ROLE ghiras_app LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO ghiras_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ghiras_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ghiras_app;
GRANT DELETE ON rate_limits TO ghiras_app;               -- the only operational table that may shrink
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM ghiras_app;
GRANT DELETE ON rate_limits TO ghiras_app;
