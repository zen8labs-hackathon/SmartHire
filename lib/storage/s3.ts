import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// One shared bucket, prefixed per file type (jd/, cv/, evaluation/ ...) --
// matches the key-naming convention the old Supabase Storage code already
// used (e.g. `jd/${id}/${fileId}${ext}`). IN9X4Q left "one bucket vs. one per
// file type" as an open question; this picks the simpler default rather than
// blocking on it.

let client: S3Client | null = null;

/**
 * Lazily-initialized singleton client. Picks up credentials via the SDK's
 * default provider chain -- explicit env vars for local/dev, EC2 IAM instance
 * role in production (IN9X4Q decision 3) -- no app-specific credential vars.
 */
function getClient(): S3Client {
  if (client) return client;

  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error("Missing AWS_REGION environment variable (required for S3 storage)");
  }
  client = new S3Client({ region });
  return client;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("Missing S3_BUCKET environment variable (required for S3 storage)");
  }
  return bucket;
}

/** Presigned PUT URL: the browser uploads directly with a plain `fetch(url, { method: "PUT", body: file })` -- no SDK needed client-side. */
export async function createSignedUploadUrl(
  key: string,
  contentType?: string | null,
  expiresInSeconds = 300,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType || undefined,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}

/** Presigned GET URL for direct browser download/redirect. */
export async function createSignedDownloadUrl(
  key: string,
  expiresInSeconds = 120,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}

/** Downloads an object's full contents server-side (e.g. for text extraction). */
export async function downloadObject(key: string): Promise<Buffer> {
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  if (!result.Body) {
    throw new Error(`Object body empty for key: ${key}`);
  }
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  );
}

/** For tests only: forces the next call to construct a fresh S3Client. */
export function resetS3ClientForTests(): void {
  client = null;
}
