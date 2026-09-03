import { redisConnection } from "@/lib/redis/connection";
import { UnrecoverableError, Worker } from "bullmq";
import {
  checkCompletedBatch,
  handleJobComplete,
  handleJobFailed,
  notifyBatchComplete,
  notifyRerunAiMatchResult,
  updateProcessingStatus,
} from "./actions";
import { candidateUploadProcessing } from "./candidate-upload";
import { cvUploadProcessing } from "./cv-upload";
import { rerunAiMatching } from "./rerun-ai-matching";

const worker = new Worker(
  "file-upload",
  async (job) => {
    if (job.name !== "rerun-ai-matching") {
      await updateProcessingStatus(job.data.fileUploadId);
    }

    switch (job.name) {
      case "upload-cv":
        await cvUploadProcessing(job.data);
        break;
      case "upload-candidate":
        await candidateUploadProcessing(job.data);
        break;
      case "rerun-ai-matching":
        await rerunAiMatching(job.data);
        break;
      default:
        throw new UnrecoverableError(`Unknown job name: ${job.name}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, //number of jobs to process in parallel
  },
);

// ==== Event listeners ====
worker.on("completed", async (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
  if (job.name === "upload-cv" || job.name === "upload-candidate") {
    //Cập nhật status job mới nhất
    await handleJobComplete(job.data.fileUploadId);

    //Check hoàn thành => query bảng upload_history để check xem tất cả các file upload của batch đã hoàn thành chưa.
    const batch = await checkCompletedBatch(job.data.fileUploadId);

    //Nếu batch đã settle: lưu notification vào db rồi bắn realtime tới người upload
    if (batch) {
      await notifyBatchComplete(job.data.fileUploadId, batch);
    }
  } else if (job.name === "rerun-ai-matching") {
    // `result?.skipped` -- CV version đã bị thay bởi bản mới hơn, job không
    // thực sự chạy match, không cần báo "hoàn tất" gây hiểu nhầm.
    const skipped =
      !!result && typeof result === "object" && "skipped" in result;
    if (!skipped && job.data.userId) {
      await notifyRerunAiMatchResult(
        job.data.userId,
        job.data.cvDetailVersionId,
        { ok: true },
        { jobId: job.data.jobId, candidateId: job.data.candidateId },
      );
    }
  }
});

worker.on("failed", async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
  if (!job) return;

  // `failed` fire trên MỖI lần attempt ném lỗi, không chỉ lần cuối -- bỏ qua
  // nếu job còn attempt để retry (sẽ có 1 lần `failed` khác khi thực sự hết).
  const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!isFinalAttempt) return;

  if (job.name === "upload-cv" || job.name === "upload-candidate") {
    //Cập nhật status job mới nhất
    await handleJobFailed(job.data.fileUploadId);

    //Check hoàn thành => query bảng upload_history để check xem tất cả các file upload của batch đã hoàn thành chưa.
    const batch = await checkCompletedBatch(job.data.fileUploadId);

    //Nếu batch đã settle: lưu notification vào db rồi bắn realtime tới người upload
    if (batch) {
      await notifyBatchComplete(job.data.fileUploadId, batch);
    }
  } else if (job.name === "rerun-ai-matching" && job.data.userId) {
    await notifyRerunAiMatchResult(
      job.data.userId,
      job.data.cvDetailVersionId,
      { ok: false, message: err.message },
      { jobId: job.data.jobId, candidateId: job.data.candidateId },
    );
  }
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

worker.on("stalled", (jobId) => {
  console.warn(`Job ${jobId} is stalled`);
});

// ==== Graceful shutdown ====
process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
