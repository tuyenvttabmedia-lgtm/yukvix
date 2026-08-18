export type WorkerMode = "all" | "http" | "import";

/** `all` (default) keeps local/dev as one process. Prod HTTP vs ZIP worker use http|import. */
export function getWorkerMode(): WorkerMode {
  const raw = (process.env.WORKER_MODE || "all").trim().toLowerCase();
  if (raw === "http" || raw === "import") return raw;
  return "all";
}

export function isHttpOnlyProcess(): boolean {
  return getWorkerMode() === "http";
}

export function isImportWorkerProcess(): boolean {
  return getWorkerMode() === "import";
}
