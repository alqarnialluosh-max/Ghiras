-- Administration team, support tickets with severity/escalation, and approvals for sensitive actions.
-- Nothing here is ever deleted; ticket history and approval decisions are append-only.

ALTER TABLE users
  ADD COLUMN staff_role  text CHECK (staff_role IN ('manager', 'tech_lead', 'support', 'coordinator', 'accountant')),
  ADD COLUMN permissions text[],                       -- NULL = the staff role's defaults
  ADD COLUMN created_by  uuid REFERENCES users(id);
ALTER TABLE users ADD CONSTRAINT users_staff_role_only_for_staff CHECK ((role = 'staff') = (staff_role IS NOT NULL));

-- ---------- Support tickets ----------
CREATE SEQUENCE ticket_number_seq START 1001;
CREATE TABLE tickets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number             bigint NOT NULL UNIQUE DEFAULT nextval('ticket_number_seq'),
  subject            text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 160),
  description        text NOT NULL DEFAULT '',
  category           text NOT NULL CHECK (category IN ('teams', 'technical', 'account', 'booking', 'payment', 'teacher', 'other')),
  severity           text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  level              int  NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 3),   -- 0 support · 1 tech lead · 2 manager · 3 owner
  assigned_to        uuid REFERENCES users(id),
  requester_id       uuid REFERENCES users(id),                               -- the parent / teacher with the problem
  booking_id         uuid REFERENCES bookings(id),
  opened_by          uuid NOT NULL REFERENCES users(id),
  due_at             timestamptz NOT NULL,                                    -- SLA for the current level
  first_response_at  timestamptz,
  resolved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_open_idx ON tickets(due_at) WHERE status IN ('open', 'in_progress', 'waiting');
CREATE INDEX tickets_assigned_idx ON tickets(assigned_to, status);
CREATE TRIGGER tickets_touch BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION ghiras_touch_updated_at();
CREATE TRIGGER tickets_no_delete   BEFORE DELETE   ON tickets FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER tickets_no_truncate BEFORE TRUNCATE ON tickets FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();

CREATE TABLE ticket_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES tickets(id),
  actor_id    uuid REFERENCES users(id),                 -- NULL = the system (auto-escalation)
  kind        text NOT NULL CHECK (kind IN ('created', 'comment', 'status', 'assign', 'escalate', 'auto_escalate', 'approval')),
  body        text,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_events_ticket_idx ON ticket_events(ticket_id, created_at);
CREATE TRIGGER ticket_events_no_update   BEFORE UPDATE   ON ticket_events FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_update();
CREATE TRIGGER ticket_events_no_delete   BEFORE DELETE   ON ticket_events FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER ticket_events_no_truncate BEFORE TRUNCATE ON ticket_events FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();

-- ---------- Approvals ----------
CREATE SEQUENCE approval_number_seq START 501;
CREATE TABLE approvals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number           bigint NOT NULL UNIQUE DEFAULT nextval('approval_number_seq'),
  kind             text NOT NULL CHECK (kind IN ('extra_session', 'extend_subscription', 'manual_activation')),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  subscription_id  uuid NOT NULL REFERENCES subscriptions(id),
  ticket_id        uuid REFERENCES tickets(id),
  payload          jsonb NOT NULL DEFAULT '{}',          -- e.g. {"sessions": 1} or {"days": 7}
  reason           text NOT NULL CHECK (char_length(reason) >= 5),
  requested_by     uuid NOT NULL REFERENCES users(id),
  decided_by       uuid REFERENCES users(id),
  decision_note    text,
  decided_at       timestamptz,
  applied_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)   -- nobody approves their own request
);
CREATE INDEX approvals_pending_idx ON approvals(created_at) WHERE status = 'pending';
CREATE TRIGGER approvals_no_delete   BEFORE DELETE   ON approvals FOR EACH ROW       EXECUTE FUNCTION ghiras_forbid_delete();
CREATE TRIGGER approvals_no_truncate BEFORE TRUNCATE ON approvals FOR EACH STATEMENT EXECUTE FUNCTION ghiras_forbid_delete();

-- A decision is final: once approved/rejected, the row can't change (except recording when it was applied).
CREATE OR REPLACE FUNCTION ghiras_approval_final() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'pending' AND (NEW.status <> OLD.status OR NEW.decided_by IS DISTINCT FROM OLD.decided_by
      OR NEW.payload <> OLD.payload OR NEW.decision_note IS DISTINCT FROM OLD.decision_note) THEN
    RAISE EXCEPTION 'GHIRAS_PROTECTED: an approval decision is final' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER approvals_final BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION ghiras_approval_final();
