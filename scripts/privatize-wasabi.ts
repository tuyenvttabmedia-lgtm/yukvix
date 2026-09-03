/**
 * Privatize full-size Wasabi objects and optionally replace the blanket public-read policy.
 *
 * Live bucket currently allows GetObject on arn:aws:s3:::BUCKET/* which bypasses object ACL.
 * Thumbs / creator assets stay public. webp, medium, original, vip-zips, download-zips do not.
 *
 *   pnpm tsx scripts/privatize-wasabi.ts
 *   pnpm tsx scripts/privatize-wasabi.ts --apply
 *   pnpm tsx scripts/privatize-wasabi.ts --apply --policy
 *   pnpm tsx scripts/privatize-wasabi.ts --apply --policy --policy-only
 */
import { config as loadEnv } from "dotenv";
import {
  GetBucketPolicyCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutObjectAclCommand,
  S3Client,
} from "@aws-sdk/client-s3";

loadEnv();

function isPrivateMediaKey(key: string): boolean {
  return (
    /\/(webp|medium|original)\//.test(key) ||
    key.startsWith("vip-zips/") ||
    key.startsWith("download-zips/")
  );
}

function publicReadPolicy(bucket: string) {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadThumbsAndCreators",
        Effect: "Allow",
        Principal: { AWS: "*" },
        Action: "s3:GetObject",
        Resource: [
          `arn:aws:s3:::${bucket}/albums/*/thumb/*`,
          `arn:aws:s3:::${bucket}/library/thumb/*`,
          `arn:aws:s3:::${bucket}/creators/*`,
          `arn:aws:s3:::${bucket}/cms/*`,
        ],
      },
    ],
  };
}

const apply = process.argv.includes("--apply");
const applyPolicy = process.argv.includes("--policy");
const policyOnly = process.argv.includes("--policy-only");
const bucket = process.env.WASABI_BUCKET || "";
const region = process.env.WASABI_REGION || "ap-southeast-1";
const endpoint = process.env.WASABI_ENDPOINT || `https://s3.${region}.wasabisys.com`;
const accessKeyId = process.env.WASABI_ACCESS_KEY_ID || process.env.WASABI_ACCESS_KEY || "";
const secretAccessKey = process.env.WASABI_SECRET_ACCESS_KEY || process.env.WASABI_SECRET_KEY || "";

if (!bucket || !accessKeyId || !secretAccessKey) {
  console.error("Missing WASABI_BUCKET / WASABI_ACCESS_KEY_ID / WASABI_SECRET_ACCESS_KEY");
  process.exit(1);
}

const client = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

const proposed = publicReadPolicy(bucket);
let currentPolicy = "";
try {
  const pol = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
  currentPolicy = pol.Policy || "";
} catch (err) {
  currentPolicy = `GET_FAILED ${(err as Error).name}`;
}

console.log(`${apply ? "APPLY" : "DRY-RUN"} bucket=${bucket} policy=${applyPolicy}`);
console.log("CURRENT_POLICY", currentPolicy);
console.log("PROPOSED_POLICY", JSON.stringify(proposed));

if (currentPolicy.includes(`arn:aws:s3:::${bucket}/*`) && currentPolicy.includes("GetObject")) {
  console.log(
    "WARN: blanket public GetObject is active — object ACL private is ignored until --policy is applied."
  );
}

if (apply && applyPolicy) {
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(proposed),
    })
  );
  console.log("bucket policy updated: thumbs+creators public, full-size private");
}

if (policyOnly) {
  console.log("skip ACL scan (--policy-only)");
  process.exit(0);
}

const prefixes = ["albums/", "library/", "vip-zips/", "download-zips/"];
let scanned = 0;
let matched = 0;
let updated = 0;
let failed = 0;

for (const prefix of prefixes) {
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );
    for (const obj of page.Contents ?? []) {
      const key = obj.Key;
      if (!key) continue;
      scanned += 1;
      if (!isPrivateMediaKey(key)) continue;
      matched += 1;
      if (!apply) continue;
      try {
        await client.send(
          new PutObjectAclCommand({ Bucket: bucket, Key: key, ACL: "private" })
        );
        updated += 1;
      } catch (err) {
        failed += 1;
        console.error(`fail ${key}:`, err instanceof Error ? err.message : err);
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

console.log(
  JSON.stringify({
    scanned,
    matched,
    updated,
    failed,
    apply,
    applyPolicy: apply && applyPolicy,
  })
);
