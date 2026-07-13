import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class FakeCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: class extends FakeCommand {},
    GetObjectCommand: class extends FakeCommand {},
    DeleteObjectCommand: class extends FakeCommand {},
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

describe("lib/storage/s3", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.AWS_REGION = "us-east-1";
    process.env.S3_BUCKET = "test-bucket";
    const { resetS3ClientForTests } = await import("@/lib/storage/s3");
    resetS3ClientForTests();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("createSignedUploadUrl requests a PutObjectCommand with the given key/contentType", async () => {
    getSignedUrlMock.mockResolvedValue("https://signed.example/put");
    const { createSignedUploadUrl } = await import("@/lib/storage/s3");

    const url = await createSignedUploadUrl("jd/abc.pdf", "application/pdf");

    expect(url).toBe("https://signed.example/put");
    const [, command, opts] = getSignedUrlMock.mock.calls[0];
    expect(command.input).toEqual({
      Bucket: "test-bucket",
      Key: "jd/abc.pdf",
      ContentType: "application/pdf",
    });
    expect(opts).toEqual({ expiresIn: 300 });
  });

  it("createSignedDownloadUrl requests a GetObjectCommand with a shorter default expiry", async () => {
    getSignedUrlMock.mockResolvedValue("https://signed.example/get");
    const { createSignedDownloadUrl } = await import("@/lib/storage/s3");

    const url = await createSignedDownloadUrl("jd/abc.pdf");

    expect(url).toBe("https://signed.example/get");
    const [, command, opts] = getSignedUrlMock.mock.calls[0];
    expect(command.input).toEqual({ Bucket: "test-bucket", Key: "jd/abc.pdf" });
    expect(opts).toEqual({ expiresIn: 120 });
  });

  it("downloadObject reads the body via transformToByteArray", async () => {
    sendMock.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
    const { downloadObject } = await import("@/lib/storage/s3");

    const buffer = await downloadObject("jd/abc.pdf");

    expect(buffer).toEqual(Buffer.from([1, 2, 3]));
    const [command] = sendMock.mock.calls[0];
    expect(command.input).toEqual({ Bucket: "test-bucket", Key: "jd/abc.pdf" });
  });

  it("downloadObject throws when the body is empty", async () => {
    sendMock.mockResolvedValue({ Body: undefined });
    const { downloadObject } = await import("@/lib/storage/s3");

    await expect(downloadObject("jd/missing.pdf")).rejects.toThrow(
      "Object body empty",
    );
  });

  it("deleteObject sends a DeleteObjectCommand for the key", async () => {
    sendMock.mockResolvedValue({});
    const { deleteObject } = await import("@/lib/storage/s3");

    await deleteObject("jd/abc.pdf");

    const [command] = sendMock.mock.calls[0];
    expect(command.input).toEqual({ Bucket: "test-bucket", Key: "jd/abc.pdf" });
  });

  it("throws a clear error when AWS_REGION is missing", async () => {
    delete process.env.AWS_REGION;
    const { createSignedDownloadUrl, resetS3ClientForTests } = await import(
      "@/lib/storage/s3"
    );
    resetS3ClientForTests();

    await expect(createSignedDownloadUrl("jd/abc.pdf")).rejects.toThrow(
      "Missing AWS_REGION",
    );
  });

  it("throws a clear error when S3_BUCKET is missing", async () => {
    delete process.env.S3_BUCKET;
    const { createSignedDownloadUrl } = await import("@/lib/storage/s3");

    await expect(createSignedDownloadUrl("jd/abc.pdf")).rejects.toThrow(
      "Missing S3_BUCKET",
    );
  });
});
