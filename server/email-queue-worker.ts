/**
 * Email Queue Worker
 * Polls the email_queue table every 10 seconds and sends pending emails.
 * Uses sendMailWithRetry for each item (retry logic is at the send level).
 * On failure, marks item for retry with exponential backoff via markEmailQueueFailed.
 */
import {
  getNextPendingEmails,
  markEmailQueueProcessing,
  markEmailQueueSent,
  markEmailQueueFailed,
} from "./db";
import { sendMailWithRetry } from "./email";

let _workerRunning = false;
let _intervalId: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 10_000; // 10 seconds
const BATCH_SIZE = 5;            // process up to 5 emails per tick

async function processOneEmail(item: {
  id: number;
  type: string;
  recipient: string;
  subject: string;
  html: string;
  textContent: string | null;
  attempts: number;
  maxAttempts: number;
  metadata: string | null;
}): Promise<void> {
  await markEmailQueueProcessing(item.id);

  const result = await sendMailWithRetry({
    type: item.type,
    to: item.recipient,
    subject: item.subject,
    html: item.html,
    text: item.textContent ?? undefined,
    metadata: item.metadata ? JSON.parse(item.metadata) : undefined,
  });

  const newAttempts = item.attempts + 1;

  if (result.success) {
    await markEmailQueueSent(item.id, result.messageId ?? "", newAttempts);
    console.log(`[EmailQueue] Sent item #${item.id} (${item.type}) to ${item.recipient}`);
  } else {
    await markEmailQueueFailed(item.id, result.error ?? "Unknown error", newAttempts, item.maxAttempts);
    if (newAttempts >= item.maxAttempts) {
      console.error(`[EmailQueue] Item #${item.id} permanently failed after ${newAttempts} attempts: ${result.error}`);
    } else {
      console.warn(`[EmailQueue] Item #${item.id} failed (attempt ${newAttempts}/${item.maxAttempts}), will retry: ${result.error}`);
    }
  }
}

async function runWorkerTick(): Promise<void> {
  if (_workerRunning) return;
  _workerRunning = true;

  try {
    let hadItems = true;
    while (hadItems) {
      const items = await getNextPendingEmails(BATCH_SIZE);
      if (items.length === 0) {
        hadItems = false;
        break;
      }
      // Process in parallel within the batch
      await Promise.allSettled(items.map(processOneEmail));
    }
  } catch (err) {
    console.error("[EmailQueue] Worker tick error:", err);
  } finally {
    _workerRunning = false;
  }
}

/**
 * Start the email queue worker. Safe to call multiple times — only one interval runs.
 */
export function startEmailQueueWorker(): void {
  if (_intervalId !== null) return; // already running

  console.log(`[EmailQueue] Worker started — polling every ${POLL_INTERVAL_MS / 1000}s`);

  // Run immediately on startup to drain any pending emails
  setTimeout(() => runWorkerTick(), 2000);

  _intervalId = setInterval(() => runWorkerTick(), POLL_INTERVAL_MS);
}

/**
 * Stop the email queue worker (useful for tests).
 */
export function stopEmailQueueWorker(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
    console.log("[EmailQueue] Worker stopped");
  }
}
