import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

const [jobs] = await conn.execute(
  'SELECT id, status, title, totalImages, processedImages, createdAt, updatedAt FROM import_jobs ORDER BY createdAt DESC LIMIT 5'
);

console.log('Recent jobs:');
for (const j of jobs) {
  console.log(`#${j.id} ${j.status} "${(j.title||'').substring(0,40)}" imgs: ${j.processedImages}/${j.totalImages} updated: ${j.updatedAt}`);
}

if (jobs.length > 0) {
  const [logs] = await conn.execute(
    'SELECT jobId, level, message, createdAt FROM import_logs WHERE jobId = ? ORDER BY createdAt DESC LIMIT 20',
    [jobs[0].id]
  );
  console.log(`\nLatest logs for job #${jobs[0].id}:`);
  for (const l of logs) {
    console.log(`[${l.createdAt}] ${l.level}: ${(l.message||'').substring(0,120)}`);
  }
}

await conn.end();
