// S3-compatible object storage (Cloudflare R2 by default; also AWS S3, MinIO,
// Supabase S3 — switch entirely via env vars). PRIVATE buckets only; files are
// served through short-lived signed URLs, never a public path.
//
// Required env:
//   STORAGE_ENDPOINT     e.g. https://<account>.r2.cloudflarestorage.com  (omit for AWS S3)
//   STORAGE_REGION       e.g. auto (R2) | us-east-1 (S3)
//   STORAGE_BUCKET       a PRIVATE bucket name
//   STORAGE_ACCESS_KEY_ID
//   STORAGE_SECRET_ACCESS_KEY
// Optional:
//   STORAGE_FORCE_PATH_STYLE  "true" for MinIO/Supabase
//   STORAGE_SIGNED_URL_TTL    seconds (default 900 = 15 min)
//   STORAGE_PUBLIC_BASE_URL   FORBIDDEN — presence triggers the public-write guard
import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, GetBucketAclCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

export function storageConfigured(): boolean {
  return Boolean(
    process.env.STORAGE_BUCKET &&
      process.env.STORAGE_ACCESS_KEY_ID &&
      process.env.STORAGE_SECRET_ACCESS_KEY,
  );
}

export function bucket(): string {
  const b = process.env.STORAGE_BUCKET;
  if (!b) throw new Error("STORAGE_BUCKET not set");
  return b;
}

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.STORAGE_REGION || "auto",
      endpoint: process.env.STORAGE_ENDPOINT || undefined, // omit -> real AWS S3
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return client;
}

/** PII guard: refuse to operate if the deployment looks public. Returns the
 *  reason it's unsafe, or null if private. Checked at boot + before every write. */
export async function assertPrivateOrThrow(): Promise<void> {
  // 1) A public base URL env means someone intends public serving — refuse.
  if (process.env.STORAGE_PUBLIC_BASE_URL) {
    throw new Error("Refusing to start: STORAGE_PUBLIC_BASE_URL is set. User uploads must be private; serve via signed URLs only.");
  }
  // 2) Best-effort: if the bucket grants public/AllUsers read, refuse. (R2 has no
  //    bucket ACLs; this is a guard for S3/MinIO where it applies.)
  try {
    const acl = await s3().send(new GetBucketAclCommand({ Bucket: bucket() }));
    const publicGrant = (acl.Grants || []).some(
      (g) => g.Grantee?.URI?.includes("AllUsers") || g.Grantee?.URI?.includes("AuthenticatedUsers"),
    );
    if (publicGrant) {
      throw new Error(`Refusing to use bucket "${bucket()}": it grants public read. Use a PRIVATE bucket.`);
    }
  } catch (e) {
    // AccessDenied/NotImplemented (e.g. R2) is expected and fine — it means we
    // can't read ACLs, which correlates with no public ACL surface. Only rethrow
    // our own explicit refusal.
    if (e instanceof Error && e.message.startsWith("Refusing")) throw e;
  }
}

export async function bucketReachable(): Promise<boolean> {
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
    return true;
  } catch {
    return false;
  }
}

/** Object key layout: scoped per user; opaque + unguessable. */
export function makeKey(userId: string, captureId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "file";
  return `users/${userId}/captures/${captureId}/${safe}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await assertPrivateOrThrow(); // never write into a public location
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      // Explicitly private; never public-read.
      ACL: "private",
    }),
  );
}

/** Time-limited signed GET URL (default 15 min). Never a permanent/public link. */
export async function signedGetUrl(key: string): Promise<string> {
  const ttl = Number(process.env.STORAGE_SIGNED_URL_TTL || 900);
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: ttl });
}
