/**
 * Riyadh is UTC+3 all year (no DST), so we can do exact arithmetic
 * with a fixed offset — no timezone database needed.
 */
export const RIYADH_OFFSET_MIN = 180;
const OFFSET_MS = RIYADH_OFFSET_MIN * 60_000;

/** "Wall clock" parts in Riyadh for a UTC instant. */
export function riyadhParts(d: Date) {
  const r = new Date(d.getTime() + OFFSET_MS);
  return {
    year: r.getUTCFullYear(),
    month: r.getUTCMonth() + 1,
    day: r.getUTCDate(),
    weekday: r.getUTCDay(),
    minutes: r.getUTCHours() * 60 + r.getUTCMinutes(),
  };
}

/** Date key YYYY-MM-DD in Riyadh. */
export function riyadhDateKey(d: Date) {
  const p = riyadhParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** UTC instant for a Riyadh date key + minutes from midnight. */
export function riyadhToUtc(dateKey: string, minutes: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutes) - OFFSET_MS);
}

export function weekdayOfKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Saudi school week starts Sunday. Returns the date key of that Sunday. */
export function weekStartKey(d: Date) {
  const key = riyadhDateKey(d);
  return addDaysKey(key, -weekdayOfKey(key));
}

export function minutesToLabel(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const period = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function timeLabel(d: Date) {
  return minutesToLabel(riyadhParts(d).minutes);
}

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long",
});
const shortDateFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric",
});

export function dateLabel(d: Date) { return dateFmt.format(d); }
export function shortDate(d: Date) { return shortDateFmt.format(d); }
export function dateTimeLabel(d: Date) { return `${dateLabel(d)} — ${timeLabel(d)}`; }
export function keyLabel(dateKey: string) { return dateLabel(riyadhToUtc(dateKey, 12 * 60)); }
