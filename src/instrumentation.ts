/** Background jobs (once per server process). Calls an internal key-protected endpoint over localhost. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const key = process.env.HASH_SECRET;
  if (!process.env.SALLA_CLIENT_ID || process.env.SALLA_SYNC_DISABLED === "true" || !key) return;
  const port = process.env.PORT ?? "3000";
  const every = Number(process.env.SALLA_SYNC_MINUTES ?? 30) * 60_000;
  const run = () =>
    fetch(`http://127.0.0.1:${port}/api/cron/salla-sync`, { method: "POST", headers: { "x-cron-key": key } }).catch(() => {});
  setTimeout(run, 90_000);
  setInterval(run, every);
}
