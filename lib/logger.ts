/**
 * Structured logger using Pino.
 *
 * Production (APP_ENV=production): only ERROR level, JSON to stdout (Docker).
 * Development: DEBUG level (default), pino-pretty colored output.
 *
 * To include X-Request-Id in logs, call logger.child({ "X-Request-Id": id }).
 */

import pino from "pino";

const appEnv =
  process.env.APP_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development");
const isProduction = appEnv === "production";

export const logger = pino({
  level: isProduction ? "error" : (process.env.LOG_LEVEL || "debug"),
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: "smarthire" },
  ...(isProduction
    ? {}
    : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});

/** Create a child logger with X-Request-Id for a specific request context. */
export function createRequestLogger(requestId: string): pino.Logger {
  return logger.child({ "X-Request-Id": requestId });
}

/**
 * Log an error. Use in catch blocks and when returning business-logic errors.
 *
 * @param msg     Human-readable message
 * @param error   Optional Error object (stack captured)
 * @param data    Optional structured extra fields (path, userId, etc.)
 */
export const logError = (
  msg: string,
  error?: Error,
  data?: Record<string, unknown>,
): void =>
  logger.error(
    { ...data, err: error ? { message: error.message, stack: error.stack } : undefined },
    msg,
  );

/** Log debug (prod: no-op). */
export const logDebug = (msg: string, data?: Record<string, unknown>): void => {
  if (!isProduction) logger.debug(data, msg);
};

/** Log info (prod: no-op). */
export const logInfo = (msg: string, data?: Record<string, unknown>): void => {
  if (!isProduction) logger.info(data, msg);
};

/** Log warning (prod: no-op). */
export const logWarn = (msg: string, data?: Record<string, unknown>): void => {
  if (!isProduction) logger.warn(data, msg);
};

/**
 * Log an API/route failure before returning 500.
 * Normalizes unknown thrown values into an Error for stack capture.
 */
export function logApiError(
  msg: string,
  error: unknown,
  data?: Record<string, unknown>,
): void {
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Unknown error");
  logError(msg, err, data);
}

/** Coerce unknown catch value to Error | undefined for logError. */
export function toError(error: unknown): Error | undefined {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return undefined;
}