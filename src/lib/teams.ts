import "server-only";
import { one, q } from "./db";
import { createSpace, googleReady } from "./google-meet";

/**
 * Automatic Teams meetings through Microsoft Graph (app-only, client credentials).
 * Each booking becomes an event in the Ghiras organizer's calendar with
 * isOnlineMeeting=true → Microsoft returns a unique Teams join URL.
 * Required Graph application permission: Calendars.ReadWrite (admin consent).
 */
const LOGIN = () => (process.env.MS_LOGIN_BASE ?? "https://login.microsoftonline.com").replace(/\/$/, "");
const GRAPH = () => (process.env.MS_GRAPH_BASE ?? "https://graph.microsoft.com/v1.0").replace(/\/$/, "");
const TIMEOUT_MS = 15_000;

/** Microsoft keys present (Teams app-only). */
export function teamsAutoConfigured() {
  return !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_ORGANIZER);
}

/** Which service gives each session its own link: Google Meet when linked, else Teams when configured, else none. */
export async function autoMeetingsProvider(): Promise<"google" | "teams" | null> {
  if (await googleReady()) return "google";
  return teamsAutoConfigured() ? "teams" : null;
}
/** Sessions get their own link automatically (so a teacher's permanent link is optional). */
export async function autoMeetingsReady() {
  return (await autoMeetingsProvider()) !== null;
}

export class TeamsError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

async function log(action: string, ok: boolean, detail: string, http_status?: number, booking_id?: string | null) {
  await q(`INSERT INTO teams_api_log (action, booking_id, ok, http_status, detail) VALUES ($1,$2,$3,$4,$5)`,
    [action, booking_id ?? null, ok, http_status ?? null, detail.slice(0, 1000)]).catch(() => {});
}

let cached: { token: string; exp: number } | null = null;

async function graphToken(): Promise<string> {
  if (cached && cached.exp - Date.now() > 120_000) return cached.token;
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID ?? "",
    client_secret: process.env.MS_CLIENT_SECRET ?? "",
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`${LOGIN()}/${encodeURIComponent(process.env.MS_TENANT_ID ?? "")}/oauth2/v2.0/token`, {
    method: "POST", body, signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) {
    await log("token", false, json.error_description ?? `HTTP ${res.status}`, res.status);
    throw new TeamsError("تعذّر الاتصال بحساب مايكروسوفت. تحقق من مفاتيح التطبيق في Railway.", res.status);
  }
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function graph<T>(path: string, init: RequestInit = {}): Promise<{ status: number; json: T }> {
  const token = await graphToken();
  const res = await fetch(`${GRAPH()}${path}`, {
    ...init, signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) cached = null;
  const json = (res.status === 202 || res.status === 204 ? {} : await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

const organizer = () => encodeURIComponent(process.env.MS_ORGANIZER ?? "");
const isoUtc = (d: Date) => d.toISOString().replace("Z", "");

type GraphEvent = { id?: string; onlineMeeting?: { joinUrl?: string } | null; error?: { message?: string } };

/**
 * Creates (or returns the existing) Teams meeting for a booking.
 * Idempotent: transactionId = booking id, so retries never create duplicates.
 */
export async function createMeeting(input: {
  bookingId: string; subject: string; start: Date; end: Date; description: string;
}): Promise<{ eventId: string; joinUrl: string }> {
  const { status, json } = await graph<GraphEvent>(`/users/${organizer()}/events`, {
    method: "POST",
    headers: { Prefer: 'outlook.timezone="UTC"' },
    body: JSON.stringify({
      subject: input.subject,
      body: { contentType: "text", content: input.description },
      start: { dateTime: isoUtc(input.start), timeZone: "UTC" },
      end: { dateTime: isoUtc(input.end), timeZone: "UTC" },
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      allowNewTimeProposals: false,
      isReminderOn: false,
      transactionId: input.bookingId,
    }),
  });
  const eventId = json.id;
  let joinUrl = json.onlineMeeting?.joinUrl;
  if (status >= 300 || !eventId) {
    await log("create", false, json.error?.message ?? `HTTP ${status}`, status, input.bookingId);
    throw new TeamsError(json.error?.message ?? `Graph HTTP ${status}`, status);
  }
  // The join URL is occasionally filled a moment after creation
  for (let i = 0; !joinUrl && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const again = await graph<GraphEvent>(`/users/${organizer()}/events/${encodeURIComponent(eventId)}?$select=onlineMeeting`);
    joinUrl = again.json.onlineMeeting?.joinUrl;
  }
  if (!joinUrl) {
    await log("create", false, "event created without a Teams join URL", status, input.bookingId);
    throw new TeamsError("أُنشئ الموعد لكن بدون رابط Teams. تأكد أن حساب المنظِّم مرخّص بـ Teams.");
  }
  await log("create", true, `event ${eventId.slice(0, 24)}…`, status, input.bookingId);
  return { eventId, joinUrl };
}

export async function cancelMeeting(eventId: string, bookingId?: string, comment = "أُعيدت جدولة الحصة") {
  const { status, json } = await graph<GraphEvent>(`/users/${organizer()}/events/${encodeURIComponent(eventId)}/cancel`, {
    method: "POST", body: JSON.stringify({ comment }),
  });
  const ok = status < 300 || status === 404;
  await log("cancel", ok, ok ? "cancelled" : json.error?.message ?? `HTTP ${status}`, status, bookingId);
  return ok;
}

// ---------------------------------------------------------------------------
// Booking integration
// ---------------------------------------------------------------------------
const SUBJECTS: Record<string, string> = { math: "الرياضيات", arabic: "لغتي", science: "العلوم" };
const MAX_ATTEMPTS = 6;

/**
 * Gives a booking its own Teams meeting. Safe to call repeatedly.
 * On failure the booking keeps its fallback link (teacher's permanent link) if any.
 */
export async function ensureBookingMeeting(bookingId: string): Promise<boolean> {
  const provider = await autoMeetingsProvider();
  if (!provider) return false;
  const b = await one<{ id: string; starts_at: Date; ends_at: Date; subject: string; status: string; teams_source: string;
    teams_attempts: number; student: string; teacher: string; description: string }>(
    `SELECT b.id, b.starts_at, b.ends_at, b.subject, b.status, b.teams_source, b.teams_attempts, b.description,
            st.full_name student, t.full_name teacher
       FROM bookings b JOIN students st ON st.id = b.student_id JOIN users t ON t.id = b.teacher_id
      WHERE b.id = $1`, [bookingId]);
  if (!b || b.teams_source === "auto" || b.status !== "scheduled" || b.ends_at.getTime() < Date.now()) return false;
  try {
    const m = provider === "google"
      ? await createSpace(b.id).then((s) => ({ joinUrl: s.uri, eventId: s.name }))
      : await createMeeting({
          bookingId: b.id,
          subject: `غِراس · ${SUBJECTS[b.subject] ?? b.subject} · ${b.student} مع ${b.teacher}`,
          start: b.starts_at, end: b.ends_at,
          description: `حصة فردية من منصة غِراس.\n${b.description || ""}`.trim(),
        });
    await q(`UPDATE bookings SET teams_link = $2, teams_event_id = $3, teams_source = 'auto', teams_error = NULL, meeting_provider = $4,
                                 teams_attempts = teams_attempts + 1 WHERE id = $1`, [b.id, m.joinUrl, m.eventId, provider]);
    return true;
  } catch (e) {
    await q(`UPDATE bookings SET teams_attempts = teams_attempts + 1, teams_error = $2 WHERE id = $1`,
      [b.id, (e as Error).message.slice(0, 300)]);
    return false;
  }
}

/** Retries bookings still waiting for their own meeting (background job). */
export async function retryPendingMeetings(limit = 25) {
  if (!(await autoMeetingsReady())) return { tried: 0, created: 0 };
  const rows = await q<{ id: string }>(
    `SELECT id FROM bookings WHERE status = 'scheduled' AND teams_source <> 'auto' AND teams_event_id IS NULL
        AND ends_at > now() AND teams_attempts < $1 ORDER BY starts_at LIMIT $2`, [MAX_ATTEMPTS, limit]);
  let created = 0;
  for (const r of rows) if (await ensureBookingMeeting(r.id)) created++;
  return { tried: rows.length, created };
}

export { log as teamsLog };
