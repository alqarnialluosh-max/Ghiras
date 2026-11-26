import "server-only";
import { audit } from "./audit";
import { q, tx } from "./db";
import { enqueue, kickOutbox } from "./email";
import { can } from "./permissions";
import { activateSubscription } from "./subscriptions";
import { APPROVAL_KIND, type ApprovalKind } from "./ticket-meta";

/*
 * Sensitive actions are requested by staff and decided by someone with approvals.decide (manager / owner).
 * Nobody approves their own request (DB check), and a decision is final (DB trigger).
 * Approved requests are applied in the same transaction as the decision.
 */

type Actor = { id: string; role: string; staff_role: string | null; permissions: string[] | null };

export class ApprovalError extends Error {}

export async function requestApproval(actor: Actor, input: {
  kind: ApprovalKind; subscriptionId: string; reason: string; sessions?: number; days?: number; ticketId?: string | null;
}) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new ApprovalError("اكتب سبب الطلب (خمسة أحرف على الأقل).");
  const id = await tx(async (c) => {
    const { rows: s } = await c.query<{ id: string; status: string; reference: string }>(
      `SELECT id, status, reference FROM subscriptions WHERE id = $1`, [input.subscriptionId]);
    const sub = s[0];
    if (!sub) throw new ApprovalError("الاشتراك غير موجود.");
    let payload: Record<string, number> = {};
    if (input.kind === "extra_session") {
      const n = Math.trunc(input.sessions ?? 1);
      if (n < 1 || n > 4) throw new ApprovalError("عدد الحصص التعويضية من 1 إلى 4.");
      if (sub.status !== "active") throw new ApprovalError("الحصة التعويضية تُضاف لاشتراك فعّال.");
      payload = { sessions: n };
    } else if (input.kind === "extend_subscription") {
      const d = Math.trunc(input.days ?? 7);
      if (d < 1 || d > 30) throw new ApprovalError("مدة التمديد من 1 إلى 30 يوماً.");
      if (sub.status !== "active") throw new ApprovalError("التمديد يكون لاشتراك فعّال.");
      payload = { days: d };
    } else if (sub.status !== "pending_payment") {
      throw new ApprovalError("التفعيل اليدوي لاشتراك بانتظار الدفع فقط.");
    }
    const { rows: dup } = await c.query(`SELECT 1 FROM approvals WHERE subscription_id = $1 AND kind = $2 AND status = 'pending'`, [sub.id, input.kind]);
    if (dup[0]) throw new ApprovalError("يوجد طلب مماثل بانتظار الاعتماد لهذا الاشتراك.");
    const { rows } = await c.query<{ id: string; number: number }>(
      `INSERT INTO approvals (kind, subscription_id, ticket_id, payload, reason, requested_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, number`,
      [input.kind, sub.id, input.ticketId ?? null, JSON.stringify(payload), reason.slice(0, 1000), actor.id]);
    const a = rows[0];
    if (input.ticketId)
      await c.query(`INSERT INTO ticket_events (ticket_id, actor_id, kind, body, data) VALUES ($1,$2,'approval',$3,$4)`,
        [input.ticketId, actor.id, `طُلب اعتماد #${a.number}: ${APPROVAL_KIND[input.kind]}`, JSON.stringify({ approval: a.id })]);
    await audit("approval.request", "approval", a.id, actor.id, { kind: input.kind, subscription: sub.id, ...payload }, c);
    // everyone who can decide (managers + owner), except the requester
    const { rows: deciders } = await c.query<{ id: string; email: string; role: string; staff_role: string | null; permissions: string[] | null }>(
      `SELECT id, email, role, staff_role, permissions FROM users WHERE role IN ('admin','staff') AND status = 'active' AND archived_at IS NULL AND id <> $1`, [actor.id]);
    for (const u of deciders.filter((u) => can(u, "approvals.decide")))
      await enqueue(c, { userId: u.id, to: u.email, template: "approval_notice", dedupeKey: `approval:${a.id}:${u.id}`,
        params: { title: `طلب اعتماد #${a.number}: ${APPROVAL_KIND[input.kind]}`, line: `الاشتراك ${sub.reference}. السبب: ${reason}`, approval: a.id } });
    return a.id;
  });
  await kickOutbox();
  return id;
}

export async function decideApproval(actor: Actor, approvalId: string, approve: boolean, note: string) {
  if (!can(actor, "approvals.decide")) throw new ApprovalError("لا تملك صلاحية الاعتماد.");
  await tx(async (c) => {
    const { rows } = await c.query<{ id: string; number: number; kind: ApprovalKind; status: string; subscription_id: string; payload: Record<string, number>;
      requested_by: string; ticket_id: string | null }>(`SELECT * FROM approvals WHERE id = $1 FOR UPDATE`, [approvalId]);
    const a = rows[0];
    if (!a || a.status !== "pending") throw new ApprovalError("هذا الطلب لم يعد بانتظار الاعتماد.");
    if (a.requested_by === actor.id) throw new ApprovalError("لا يمكنك اعتماد طلب قدّمته بنفسك.");
    if (approve) {
      if (a.kind === "extra_session") {
        const r = await c.query(`UPDATE subscriptions SET sessions_total = sessions_total + $2 WHERE id = $1 AND status = 'active'`, [a.subscription_id, a.payload.sessions]);
        if (!r.rowCount) throw new ApprovalError("الاشتراك لم يعد فعّالاً.");
      } else if (a.kind === "extend_subscription") {
        const r = await c.query(`UPDATE subscriptions SET ends_at = ends_at + make_interval(days => $2) WHERE id = $1 AND status = 'active'`, [a.subscription_id, a.payload.days]);
        if (!r.rowCount) throw new ApprovalError("الاشتراك لم يعد فعّالاً.");
      } else {
        const ok = await activateSubscription(c, a.subscription_id, { actorId: actor.id, note: `اعتماد #${a.number}` });
        if (!ok) throw new ApprovalError("الاشتراك لم يعد بانتظار الدفع.");
      }
    }
    await c.query(`UPDATE approvals SET status = $2, decided_by = $3, decision_note = $4, decided_at = now(), applied_at = CASE WHEN $2 = 'approved' THEN now() END
                    WHERE id = $1`, [a.id, approve ? "approved" : "rejected", actor.id, note.trim().slice(0, 1000) || null]);
    if (a.ticket_id)
      await c.query(`INSERT INTO ticket_events (ticket_id, actor_id, kind, body, data) VALUES ($1,$2,'approval',$3,$4)`,
        [a.ticket_id, actor.id, `${approve ? "اعتُمد" : "رُفض"} الطلب #${a.number}${note.trim() ? `: ${note.trim()}` : ""}`, JSON.stringify({ approval: a.id })]);
    await audit(approve ? "approval.approve" : "approval.reject", "approval", a.id, actor.id, { kind: a.kind, note }, c);
    const { rows: req } = await c.query<{ id: string; email: string }>(`SELECT id, email FROM users WHERE id = $1`, [a.requested_by]);
    if (req[0]) await enqueue(c, { userId: req[0].id, to: req[0].email, template: "approval_notice", dedupeKey: `approval_done:${a.id}`,
      params: { title: `${approve ? "اعتُمد" : "رُفض"} طلبك #${a.number}: ${APPROVAL_KIND[a.kind]}`, line: note.trim() || (approve ? "نُفّذ الطلب." : "لم يُعتمد الطلب."), approval: a.id } });
  });
  await kickOutbox();
}

export type ApprovalRow = {
  id: string; number: number; kind: ApprovalKind; status: string; subscription_id: string; reference: string; student: string; parent: string;
  payload: Record<string, number>; reason: string; requested_by: string; requester: string; decided_by: string | null; decider: string | null;
  decision_note: string | null; decided_at: Date | null; created_at: Date; ticket_id: string | null; ticket_number: number | null;
};

export function listApprovals(where = "TRUE", params: unknown[] = []) {
  return q<ApprovalRow>(`
    SELECT a.*, s.reference, st.full_name student, p.full_name parent, r.full_name requester, d.full_name decider, t.number ticket_number
      FROM approvals a JOIN subscriptions s ON s.id = a.subscription_id JOIN students st ON st.id = s.student_id
      JOIN users p ON p.id = s.parent_id JOIN users r ON r.id = a.requested_by LEFT JOIN users d ON d.id = a.decided_by
      LEFT JOIN tickets t ON t.id = a.ticket_id
     WHERE ${where} ORDER BY (a.status = 'pending') DESC, a.created_at DESC LIMIT 200`, params);
}
