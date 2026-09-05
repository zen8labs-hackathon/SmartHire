import IORedis from "ioredis";

//declare global to store queue to avoid recreating queue when hot reload in development mode
declare global {
  var __redisConnection: IORedis | undefined;
}

const URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redisConnection =
  global.__redisConnection ||
  new IORedis(URL, {
    maxRetriesPerRequest: null,
  });

global.__redisConnection = redisConnection;
