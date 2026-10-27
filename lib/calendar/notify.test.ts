import { beforeEach, describe, expect, it, vi } from "vitest";
import { calendarHref, fmtWhen, resetEmailTokenCache, sendEmail } from "./notify";

describe("calendarHref", () => {
  it("links to the GMT+7 week of the start and the session", () => {
    // 2026-10-25 20:00Z is Monday 2026-10-26 03:00 in GMT+7.
    expect(calendarHref("42", "2026-10-25T20:00:00Z")).toBe("/admin/calendar-2?week=2026-10-26&session=42");
    expect(calendarHref("42", new Date("2026-10-25T16:00:00Z"))).toBe("/admin/calendar-2?week=2026-10-19&session=42");
  });

  it("leaves out the week when the start is missing or invalid", () => {
    expect(calendarHref("7")).toBe("/admin/calendar-2?session=7");
    expect(calendarHref("7", "not a date")).toBe("/admin/calendar-2?session=7");
  });
});

describe("fmtWhen", () => {
  it("formats the start in GMT+7", () => {
    expect(fmtWhen("2026-10-25T20:00:00Z")).toBe("Monday 2026-10-26, 03:00 (GMT+7)");
  });
});

describe("sendEmail", () => {
  const env = { enabled: true, tenantId: "t", clientId: "c", clientSecret: "s", sender: "hr@x.io" };
  const ok = (body: unknown = {}) => new Response(JSON.stringify(body), { status: 200 });

  beforeEach(() => resetEmailTokenCache());

  it("does nothing when disabled or without recipients", async () => {
    const fetch = vi.fn();
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail({ to: ["a@x.io"], subject: "s", text: "t" }, { fetch, env: { ...env, enabled: false } });
    await sendEmail({ to: [null, "", "not-an-email"], subject: "s", text: "t" }, { fetch, env });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gets a token, then sends one message to the distinct recipients", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValue(new Response(null, { status: 202 }));
    await sendEmail({ to: ["a@x.io", "a@x.io", "b@x.io"], subject: "Hi", text: "Body" }, { fetch, env });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe("https://graph.microsoft.com/v1.0/users/hr%40x.io/sendMail");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const msg = JSON.parse(init.body).message;
    expect(msg.subject).toBe("Hi");
    expect(msg.toRecipients).toEqual([{ emailAddress: { address: "a@x.io" } }, { emailAddress: { address: "b@x.io" } }]);

    // The token is reused for the next message.
    await sendEmail({ to: ["c@x.io"], subject: "Again", text: "" }, { fetch, env });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("logs and swallows a failed send", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValue(new Response(null, { status: 403 }));
    await expect(sendEmail({ to: ["a@x.io"], subject: "s", text: "t" }, { fetch, env })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
