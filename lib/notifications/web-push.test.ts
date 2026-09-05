import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationEvent } from "@/lib/redis/channels";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

class FakeWebPushError extends Error {
  statusCode: number;
  constructor(statusCode: number) {
    super(`web push ${statusCode}`);
    this.statusCode = statusCode;
  }
}

vi.mock("web-push", () => ({
  default: { setVapidDetails, sendNotification },
  WebPushError: FakeWebPushError,
}));

const listPushSubscriptionsByUserId = vi.fn();
const deletePushSubscriptionByEndpoint = vi.fn();

vi.mock("@/lib/db/push-subscriptions", () => ({
  listPushSubscriptionsByUserId,
  deletePushSubscriptionByEndpoint,
}));
vi.mock("@/lib/db/config/client", () => ({ getPool: () => ({}) }));
vi.mock("@/lib/logger", () => ({ logApiError: vi.fn(), logWarn: vi.fn() }));

const EVENT: NotificationEvent = {
  id: "n1",
  type: "BATCH_COMPLETE",
  title: "Done",
  body: "All good",
  data: { href: "/admin/candidates" },
  createdAt: "2026-09-05T00:00:00.000Z",
  readAt: null,
};

function sub(endpoint: string) {
  return { endpoint, p256dh: "p", auth: "a" };
}

async function importWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v ?? "");
  return import("@/lib/notifications/web-push");
}

const FULL_ENV = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:ops@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendWebPushToUser", () => {
  it("no-ops (no DB read, no send) when VAPID env is missing", async () => {
    const { sendWebPushToUser } = await importWithEnv({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined,
      VAPID_PRIVATE_KEY: undefined,
      VAPID_SUBJECT: undefined,
    });

    const delivered = await sendWebPushToUser("user-1", EVENT);

    expect(delivered).toBe(0);
    expect(listPushSubscriptionsByUserId).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends the serialized event to every subscription", async () => {
    listPushSubscriptionsByUserId.mockResolvedValue([sub("e1"), sub("e2")]);
    sendNotification.mockResolvedValue(undefined);

    const { sendWebPushToUser } = await importWithEnv(FULL_ENV);
    const delivered = await sendWebPushToUser("user-1", EVENT);

    expect(delivered).toBe(2);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [subscription, payload] = sendNotification.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: "e1",
      keys: { p256dh: "p", auth: "a" },
    });
    expect(JSON.parse(payload)).toEqual(EVENT);
  });

  it("prunes a subscription the push service reports gone (410) but keeps others", async () => {
    listPushSubscriptionsByUserId.mockResolvedValue([sub("dead"), sub("live")]);
    sendNotification
      .mockRejectedValueOnce(new FakeWebPushError(410))
      .mockResolvedValueOnce(undefined);

    const { sendWebPushToUser } = await importWithEnv(FULL_ENV);
    const delivered = await sendWebPushToUser("user-1", EVENT);

    expect(delivered).toBe(1);
    expect(deletePushSubscriptionByEndpoint).toHaveBeenCalledWith(
      expect.anything(),
      "dead",
    );
    expect(deletePushSubscriptionByEndpoint).not.toHaveBeenCalledWith(
      expect.anything(),
      "live",
    );
  });

  it("does not prune on a transient error (500)", async () => {
    listPushSubscriptionsByUserId.mockResolvedValue([sub("e1")]);
    sendNotification.mockRejectedValueOnce(new FakeWebPushError(500));

    const { sendWebPushToUser } = await importWithEnv(FULL_ENV);
    const delivered = await sendWebPushToUser("user-1", EVENT);

    expect(delivered).toBe(0);
    expect(deletePushSubscriptionByEndpoint).not.toHaveBeenCalled();
  });

  it("skips the send entirely when the user has no subscriptions", async () => {
    listPushSubscriptionsByUserId.mockResolvedValue([]);

    const { sendWebPushToUser } = await importWithEnv(FULL_ENV);
    const delivered = await sendWebPushToUser("user-1", EVENT);

    expect(delivered).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
