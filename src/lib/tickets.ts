import "server-only";
import type { PoolClient } from "pg";
import { audit } from "./audit";
import { one, q, tx } from "./db";
import { enqueue, kickOutbox } from "./email";
import { SEVERITY, TICKET_CATEGORY, TICKET_LEVELS, type Category, type Severity, type TicketStatus } from "./ticket-meta";

/*
 * Support tickets. Staff open a ticket for a family's or teacher's problem and set its severity.
 *  - low / medium stay with support (level 0), assigned to whoever opened it.
 *  - high / critical go straight to the tech lead (technical categories) or the manager (everything else).
 *  - each severity has a deadline; when it passes unresolved, the ticket climbs one level automatically:
 *      technical:  support → tech lead → manager → owner      other:  support → manager → owner
 * Every change is an append-only ticket_events row.
 */

const TECHNICAL: Category[] = ["teams", "technical", "account"];
export const pathFor = (c: Category) => (TECHNICAL.includes(c) ? [0, 1, 2, 3] : [0, 2, 3]);
const OPEN = ["open", "in_progress", "waiting"];

type Runner = Pick<PoolClient, "query">;
type Actor = { id: string; role: string; staff_role: string | null };

/** Someone at this level (fewest open tickets first). Owner level = the admin account(s). */
async function pickAssignee(c: Runner, level: number): Promise<{ id: string; email: string; full_name: string } | null> {
  const where = level === 3 ? "u.role = 'admin'"
    : level === 2 ? "u.role = 'staff' AND u.staff_role = 'manager'"
    : level === 1 ? "u.role = 'staff' AND u.staff_role = 'tech_lead'" : "false";
  const { rows } = await c.query<{ id: string; email: string; full_name: string }>(
    `SELECT u.id, u.email, u.full_name FROM users u
      WHERE ${where} AND u.status = 'active' AND u.archived_at IS NULL
      ORDER BY (SELECT count(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status = ANY($1)) ASC, u.created_at ASC LIMIT 1`, [OPEN]);
  return rows[0] ?? null;
}

/** Walk up the path from `level` until someone is there to take it. */
async function landAt(c: Runner, category: Category, level: number) {
  const path = pathFor(category).filter((l) => l >= level);
  for (const l of path) {
    if (l === 0) return { level: 0, assignee: null };
    const a = await pickAssignee(c, l);
    if (a) return { level: l, assignee: a };
  }
  return { level: 3, assignee: await pickAssignee(c, 3) };
}

async function event(c: Runner, ticketId: string, actorId: string | null, kind: string, body?: string | null, data: object = {}) {
  await c.query(`INSERT INTO ticket_events (ticket_id, actor_id, kind, body, data) VALUES ($1,$2,$3,$4,$5)`,
    [ticketId, actorId, kind, body ?? null, JSON.stringify(data)]);
}

async function notify(c: Runner, to: { id: string; email: string } | null, t: { id: string; number: number; subject: string; severity: Severity },
  title: string, line: string) {
  if (!to) return;
  await enqueue(c, { userId: to.id, to: to.email, template: "ticket_notice",
    params: { title, line, subject: t.subject, number: String(t.number), severity: SEVERITY[t.severity].label, ticket: t.id } });
}

export async function createTicket(actor: Actor, input: {
  subject: string; description: string; category: Category; severity: Severity; requesterId?: string | null; bookingId?: string | null;
}) {
  const id = await tx(async (c) => {
    const start = input.severity === "high" || input.severity === "critical" ? (TECHNICAL.includes(input.category) ? 1 : 2) : 0;
    const landed = await landAt(c, input.category, start);
    const assignee = landed.level === 0 ? actor.id : landed.assignee?.id ?? null;
    const { rows } = await c.query<{ id: string; number: number }>(
      `INSERT INTO tickets (subject, description, category, severity, level, assigned_to, requester_id, booking_id, opened_by, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + make_interval(hours => $10)) RETURNING id, number`,
      [input.subject, input.description, input.category, input.severity, landed.level, assignee, input.requesterId ?? null,
       input.bookingId ?? null, actor.id, SEVERITY[input.severity].hours]);
    const t = { ...rows[0], subject: input.subject, severity: input.severity };
    await event(c, t.id, actor.id, "created", input.description, { severity: input.severity, category: input.category, level: landed.level });
    await audit("ticket.create", "ticket", t.id, actor.id, { severity: input.severity, level: landed.level }, c);
    if (landed.level > 0 && landed.assignee && landed.assignee.id !== actor.id)
      await notify(c, landed.assignee, t, `تذكرة ${SEVERITY[input.severity].label} بانتظارك: ${input.subject}`,
        `فُتحت تذكرة في «${TICKET_CATEGORY[input.category]}» وأُسندت إليك بصفتك ${TICKET_LEVELS[landed.level]}.`);
    if (input.severity === "critical" && landed.level < 3) {
      const owner = await pickAssignee(c, 3);
      if (owner && owner.id !== actor.id) await notify(c, owner, t, `تذكرة حرجة: ${input.subject}`, "للعلم: فُتحت تذكرة بدرجة حرجة.");
    }
    return t.id;
  });
  await kickOutbox();
  return id;
}

export async function escalateTicket(actor: Actor | null, ticketId: string, reason: string) {
  await tx(async (c) => {
    const { rows } = await c.query<{ id: string; number: number; subject: string; severity: Severity; category: Category; level: number; status: string }>(
      `SELECT id, number, subject, severity, category, level, status FROM tickets WHERE id = $1 FOR UPDATE`, [ticketId]);
    const t = rows[0];
    if (!t || !OPEN.includes(t.status)) throw new Error("التذكرة مغلقة.");
    const next = pathFor(t.category).find((l) => l > t.level);
    if (next === undefined) throw new Error("التذكرة عند المالك، وهو أعلى مستوى.");
    const landed = await landAt(c, t.category, next);
    await c.query(`UPDATE tickets SET level = $2, assigned_to = $3, status = CASE WHEN status = 'waiting' THEN 'waiting' ELSE 'open' END,
                     due_at = now() + make_interval(hours => $4) WHERE id = $1`,
      [t.id, landed.level, landed.assignee?.id ?? null, SEVERITY[t.severity].hours]);
    await event(c, t.id, actor?.id ?? null, actor ? "escalate" : "auto_escalate", reason, { from: t.level, to: landed.level });
    await audit(actor ? "ticket.escalate" : "ticket.auto_escalate", "ticket", t.id, actor?.id ?? null, { to: landed.level, reason }, c);
    await notify(c, landed.assignee, t, `تذكرة مصعّدة إليك: ${t.subject}`,
      actor ? `صُعّدت التذكرة إليك بصفتك ${TICKET_LEVELS[landed.level]}. السبب: ${reason}` : `تجاوزت التذكرة مهلتها دون حل، فصُعّدت تلقائياً إليك بصفتك ${TICKET_LEVELS[landed.level]}.`);
  });
  await kickOutbox();
}

/** Background job: tickets past their deadline climb one level (owner level stays, the owner is reminded once). */
export async function autoEscalateTickets() {
  const due = await q<{ id: string }>(`SELECT id FROM tickets WHERE status IN ('open','in_progress') AND due_at < now() AND level < 3 LIMIT 50`);
  for (const d of due) await escalateTicket(null, d.id, "تجاوزت المهلة").catch(() => undefined);
  return due.length;
}

export async function updateTicket(actor: Actor, ticketId: string, change: { status?: TicketStatus; comment?: string; assignTo?: string | null }) {
  await tx(async (c) => {
    const { rows } = await c.query<{ id: string; status: string; assigned_to: string | null; first_response_at: Date | null; number: number; subject: string; severity: Severity }>(
      `SELECT id, status, assigned_to, first_response_at, number, subject, severity FROM tickets WHERE id = $1 FOR UPDATE`, [ticketId]);
    const t = rows[0];
    if (!t) throw new Error("التذكرة غير موجودة.");
    if (change.comment?.trim()) await event(c, t.id, actor.id, "comment", change.comment.trim().slice(0, 4000));
    if (change.status && change.status !== t.status) {
      await c.query(`UPDATE tickets SET status = $2, resolved_at = CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at, now()) ELSE NULL END
                      WHERE id = $1`, [t.id, change.status]);
      await event(c, t.id, actor.id, "status", null, { from: t.status, to: change.status });
    }
    if (change.assignTo !== undefined && change.assignTo !== t.assigned_to) {
      await c.query(`UPDATE tickets SET assigned_to = $2 WHERE id = $1`, [t.id, change.assignTo]);
      await event(c, t.id, actor.id, "assign", null, { to: change.assignTo });
      if (change.assignTo && change.assignTo !== actor.id) {
        const { rows: u } = await c.query<{ id: string; email: string }>(`SELECT id, email FROM users WHERE id = $1`, [change.assignTo]);
        await notify(c, u[0] ?? null, t, `أُسندت إليك تذكرة: ${t.subject}`, "أسند إليك أحد أعضاء الفريق هذه التذكرة.");
      }
    }
    if (!t.first_response_at && (change.comment?.trim() || change.status)) await c.query(`UPDATE tickets SET first_response_at = now() WHERE id = $1`, [t.id]);
    await audit("ticket.update", "ticket", t.id, actor.id, { status: change.status ?? null, assign: change.assignTo ?? null }, c);
  });
  await kickOutbox();
}

export async function ticketById(id: string) {
  return one<TicketRow>(`${TICKET_SELECT} WHERE t.id = $1`, [id]);
}

export type TicketRow = {
  id: string; number: number; subject: string; description: string; category: Category; severity: Severity; status: TicketStatus;
  level: number; assigned_to: string | null; assignee_name: string | null; requester_id: string | null; requester_name: string | null;
  requester_role: string | null; requester_email: string | null; booking_id: string | null; opened_by: string; opener_name: string;
  due_at: Date; first_response_at: Date | null; resolved_at: Date | null; created_at: Date; updated_at: Date;
};

export const TICKET_SELECT = `
  SELECT t.*, a.full_name assignee_name, r.full_name requester_name, r.role requester_role, r.email requester_email, o.full_name opener_name
    FROM tickets t LEFT JOIN users a ON a.id = t.assigned_to LEFT JOIN users r ON r.id = t.requester_id JOIN users o ON o.id = t.opened_by`;
