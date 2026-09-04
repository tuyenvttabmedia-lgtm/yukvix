/**
 * mysql2 + drizzle-orm return shapes vary:
 *   [ResultSetHeader, FieldPacket[]]  OR  ResultSetHeader
 * Never default missing affectedRows to 1 (that would double-claim).
 */
function readCount(header: unknown): number {
  if (!header || typeof header !== "object") return 0;
  const rec = header as { affectedRows?: unknown; rowsAffected?: unknown };
  const raw = rec.affectedRows ?? rec.rowsAffected;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function mysqlAffectedRows(result: unknown): number {
  if (result == null) return 0;
  if (Array.isArray(result)) return readCount(result[0]);
  return readCount(result);
}

export function mysqlClaimSucceeded(result: unknown): boolean {
  return mysqlAffectedRows(result) === 1;
}
