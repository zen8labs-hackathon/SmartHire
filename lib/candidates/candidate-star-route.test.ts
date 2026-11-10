import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorize, query } = vi.hoisted(() => ({
  authorize: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/admin/require-staff-request", () => ({ requireHrForRequest: authorize }));
vi.mock("@/lib/db/config/client", () => ({ getPool: () => ({ query }) }));
vi.mock("@/lib/logger", () => ({ logApiError: vi.fn() }));

import { PUT } from "@/app/api/admin/candidates-2/[id]/star/route";

const id = "01a1afbc-af33-7186-a64f-7e35dfe264bf";
const context = () => ({ params: Promise.resolve({ id }) });
const request = (body: unknown) => new Request("http://localhost/api/admin/candidates-2/" + id + "/star", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({ ok: true, userId: "hr-user" });
});

describe("candidate star API", () => {
  it("denies callers without HR access before writing", async () => {
    authorize.mockResolvedValue({ ok: false, response: Response.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await PUT(request({ starred: true }), context())).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([true, false])("persists the requested state %s", async (starred) => {
    query.mockResolvedValue({ rows: [{ id, is_starred: starred }] });
    const response = await PUT(request({ starred }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id, starred });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("deleted_at IS NULL"), [id, starred]);
  });

  it.each([null, {}, { starred: "false" }])("rejects invalid state %j without writing", async (body) => {
    expect((await PUT(request(body), context())).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or deleted candidate", async () => {
    query.mockResolvedValue({ rows: [] });
    expect((await PUT(request({ starred: true }), context())).status).toBe(404);
  });
});
