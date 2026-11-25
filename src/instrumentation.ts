/** Background jobs (once per server process). Calls an internal key-protected endpoint over localhost. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const key = process.env.HASH_SECRET;
  const salla = !!process.env.SALLA_CLIENT_ID && process.env.SALLA_SYNC_DISABLED !== "true";
  const teams = !!process.env.MS_CLIENT_ID;
  if (!key || (!salla && !teams) || process.env.JOBS_DISABLED === "true") return;
  const port = process.env.PORT ?? "3000";
  const every = Number(process.env.JOBS_EVERY_MINUTES ?? 15) * 60_000;
  const run = () =>
    fetch(`http://127.0.0.1:${port}/api/cron/jobs`, { method: "POST", headers: { "x-cron-key": key } }).catch(() => {});
  setTimeout(run, 90_000);
  setInterval(run, every);
}
