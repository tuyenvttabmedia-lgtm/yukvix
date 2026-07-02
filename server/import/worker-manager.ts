/**
 * Worker Manager — in-process queue manager (no Redis required)
 * Workers run inside the same Node.js process using p-queue.
 */

let started = false;

export async function startImportWorkers(): Promise<void> {
  if (started) return;
  started = true;
  console.log("[ImportWorkers] In-process queue ready (no Redis required)");
}

export async function stopImportWorkers(): Promise<void> {
  started = false;
  console.log("[ImportWorkers] Stopped");
}

export function isWorkersStarted(): boolean {
  return started;
}
