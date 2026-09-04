import { resolveSocialAdapter } from "./adapters";
import { runTelegramScheduleTick } from "./schedule";
import {
  claimSocialPost,
  getSocialQueue,
  nextRetryAt,
  recoverStuckSocialPosts,
  type SocialPostRow,
  type SocialQueueStore,
} from "./queue";
import {
  isRetryableSocialError,
  sanitizeAttemptPayload,
  sanitizeSocialErrorMessage,
} from "./sanitize";
import { SocialApiError, SocialNotImplementedError, type MediaSnapshot } from "./types";

const POLL_MS = 5_000;
const SCHEDULE_POLL_MS = 60_000;
const CONCURRENCY = 2;
/** Reclaim processing rows whose lease (processedAt) is older than this. */
export const SOCIAL_STUCK_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 60_000;

const inFlight = new Set<number>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let scheduleIntervalId: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;

function snapshotMedia(post: SocialPostRow): MediaSnapshot {
  try {
    const parsed = JSON.parse(post.mediaJson) as MediaSnapshot;
    if (parsed && Array.isArray(parsed.items)) return parsed;
  } catch {
    /* ignore */
  }
  return { items: [] };
}

function snapshotPolicy(post: SocialPostRow): {
  allowed?: boolean;
  requiresSensitive?: boolean;
} {
  try {
    const parsed = JSON.parse(post.policyJson) as {
      allowed?: boolean;
      requiresSensitive?: boolean;
    };
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* ignore */
  }
  return {};
}

function startLeaseHeartbeat(postId: number, store: SocialQueueStore) {
  const tick = () => {
    void store
      .updateStatus(postId, { processedAt: new Date() }, "processing")
      .catch(() => undefined);
  };
  tick();
  const id = setInterval(tick, HEARTBEAT_MS);
  id.unref?.();
  return () => clearInterval(id);
}

async function commitProcessingOutcome(
  store: SocialQueueStore,
  postId: number,
  patch: Parameters<SocialQueueStore["updateStatus"]>[1]
): Promise<boolean> {
  return store.updateStatus(postId, patch, "processing");
}

export async function processClaimedPost(
  post: SocialPostRow,
  store: SocialQueueStore = getSocialQueue()
): Promise<"sent" | "failed" | "retry" | "lost_lease"> {
  const media = snapshotMedia(post);
  const policy = snapshotPolicy(post);
  const nextAttempt = post.attempts + 1;
  const stopHeartbeat = startLeaseHeartbeat(post.id, store);

  try {
    if (policy.allowed === false) {
      throw new SocialApiError({
        message: "policy rejection",
        httpStatus: 400,
        code: "CONTENT_REJECTED",
        retryable: false,
      });
    }
    const adapter = await resolveSocialAdapter(post);
    const uploaded = [];
    for (const item of media.items) {
      uploaded.push(await adapter.uploadMedia(item));
    }
    const result = await adapter.publishPost({
      caption: post.caption || "",
      media: media.items,
      labels: policy.requiresSensitive ? { sensitive: true } : undefined,
    });
    await store.insertAttempt({
      postId: post.id,
      attempt: nextAttempt,
      ok: true,
      responseJson: sanitizeAttemptPayload({ uploaded, result }),
    });
    const kept = await commitProcessingOutcome(store, post.id, {
      status: "sent",
      attempts: nextAttempt,
      lastError: null,
      processedAt: new Date(),
      externalPostId: result.externalPostId,
      externalUrl: result.externalUrl ?? null,
    });
    if (!kept) return "lost_lease";
    return "sent";
  } catch (err) {
    const httpStatus =
      err instanceof SocialApiError
        ? err.httpStatus
        : typeof (err as { httpStatus?: number }).httpStatus === "number"
          ? (err as { httpStatus: number }).httpStatus
          : null;
    const code =
      err instanceof SocialApiError
        ? err.code
        : err instanceof SocialNotImplementedError
          ? "NOT_IMPLEMENTED"
          : ((err as { code?: string }).code ?? null);
    const message = sanitizeSocialErrorMessage(err);
    const retryAfterSeconds =
      err instanceof SocialApiError ? err.retryAfterSeconds : undefined;
    const retryable =
      err instanceof SocialApiError
        ? err.retryable
        : isRetryableSocialError({ httpStatus, code, message });
    await store.insertAttempt({
      postId: post.id,
      attempt: nextAttempt,
      ok: false,
      httpStatus,
      error: message,
      responseJson: sanitizeAttemptPayload({
        code,
        name: err instanceof Error ? err.name : "Error",
        retryAfterSeconds,
      }),
    });

    const exhausted = nextAttempt >= post.maxAttempts || !retryable;
    if (exhausted) {
      const kept = await commitProcessingOutcome(store, post.id, {
        status: "failed",
        attempts: nextAttempt,
        lastError: message,
        processedAt: new Date(),
      });
      return kept ? "failed" : "lost_lease";
    }
    const backoff = nextRetryAt(nextAttempt);
    const retryAt =
      retryAfterSeconds && retryAfterSeconds > 0
        ? new Date(
            Math.max(
              Date.now() + retryAfterSeconds * 1000,
              backoff.getTime()
            )
          )
        : backoff;
    const kept = await commitProcessingOutcome(store, post.id, {
      status: "pending",
      attempts: nextAttempt,
      lastError: message,
      scheduledAt: retryAt,
      processedAt: null,
    });
    return kept ? "retry" : "lost_lease";
  } finally {
    stopHeartbeat();
  }
}

export async function runSocialWorkerTick(
  store: SocialQueueStore = getSocialQueue()
): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    await recoverStuckSocialPosts({
      store,
      timeoutMs: SOCIAL_STUCK_MS,
      inFlightIds: Array.from(inFlight),
    });
    const slots = Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const claimed = await claimSocialPost(new Date(), store);
        if (!claimed) return;
        inFlight.add(claimed.id);
        try {
          await processClaimedPost(claimed, store);
        } finally {
          inFlight.delete(claimed.id);
        }
      }
    });
    await Promise.all(slots);
  } finally {
    tickRunning = false;
  }
}

function logTickError(err: unknown): void {
  console.error("[Social] tick error", sanitizeSocialErrorMessage(err));
}

export function startSocialWorker(): void {
  if (intervalId) return;
  console.log(
    `[Social] Worker started — polling every ${POLL_MS / 1000}s, concurrency ${CONCURRENCY}`
  );
  setTimeout(() => {
    runSocialWorkerTick().catch(logTickError);
  }, 2500);
  intervalId = setInterval(() => {
    runSocialWorkerTick().catch(logTickError);
  }, POLL_MS);
  setTimeout(() => {
    runTelegramScheduleTick().catch(logTickError);
  }, 15_000);
  scheduleIntervalId = setInterval(() => {
    runTelegramScheduleTick().catch(logTickError);
  }, SCHEDULE_POLL_MS);
}

export function stopSocialWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (scheduleIntervalId) {
    clearInterval(scheduleIntervalId);
    scheduleIntervalId = null;
  }
}
