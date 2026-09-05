import { Queue } from "bullmq";
import { redisConnection } from "../redis/connection";

//declare global to store queue to avoid recreating queue when hot reload in development mode
declare global {
  var __fileUploadQueue: Queue | undefined;
}

export const fileUploadQueue = new Queue("file-upload", {
  connection: redisConnection,
  defaultJobOptions: {
    //delete job from queue when completed or failed, with max number of jobs to keep in the queue
    removeOnComplete: 1000,
    removeOnFail: 5000,

    //retry options when job fails
    attempts: process.env.UPLOAD_JOB_RETRY_ATTEMPTS
      ? parseInt(process.env.UPLOAD_JOB_RETRY_ATTEMPTS)
      : 3, //number of retry attempts
    backoff: {
      type: "exponential", //delay time increases exponentially with each retry
      delay: 2000, //2 seconds
    },
  },
});

/* 
TODO: add deduplication jobs using simple mode strategy when add job to queue
await cvUploadQueue.add('parse-cv', { fileUrl, fileHash }, {
  deduplication: { id: `cv-${fileHash}`},
}); 
*/

global.__fileUploadQueue = fileUploadQueue;
