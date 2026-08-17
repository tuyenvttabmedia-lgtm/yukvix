/** HOTFIX-007 — cleanup smoke test (run on VPS: node --import tsx scripts/hotfix-007-test-cleanup.ts) */
import { runFullCleanup } from "../server/import/cleanup-service";

async function run(label: string) {
  console.log(`\n=== ${label} ===`);
  const results = await runFullCleanup();
  console.log(JSON.stringify(results, null, 2));
  return results;
}

try {
  await run("Cleanup run 1");
  await run("Cleanup run 2");
  console.log("\nHOTFIX-007 cleanup tests: PASS");
  process.exit(0);
} catch (err) {
  console.error("\nHOTFIX-007 cleanup tests: FAIL", err);
  process.exit(1);
}
