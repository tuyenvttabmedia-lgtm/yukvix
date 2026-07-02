/**
 * Keep-Alive Module for Cloud Run
 *
 * Cloud Run throttles CPU when there are no active HTTP requests.
 * Background queue workers (p-queue) will freeze or run extremely slowly.
 *
 * Solution: self-ping the server's health endpoint every 4 seconds while
 * any import job is actively running. This keeps the Cloud Run instance
 * "warm" and CPU allocated.
 *
 * IMPORTANT: 4s interval is critical — Cloud Run can throttle within 10s
 * of no HTTP activity. 8s was too slow and caused timeouts.
 */

let activeJobs = 0;
let pingInterval: ReturnType<typeof setInterval> | null = null;

function getServerUrl(): string {
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

async function ping(): Promise<void> {
  try {
    const url = `${getServerUrl()}/api/import/keepalive`;
    await fetch(url, { signal: AbortSignal.timeout(3000) });
  } catch {
    // Silently ignore ping failures
  }
}

export function startKeepAlive(): void {
  activeJobs++;
  if (!pingInterval) {
    // Ping immediately, then every 4 seconds (more aggressive than 8s)
    ping();
    pingInterval = setInterval(ping, 4000);
  }
}

export function stopKeepAlive(): void {
  activeJobs = Math.max(0, activeJobs - 1);
  if (activeJobs === 0 && pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}
