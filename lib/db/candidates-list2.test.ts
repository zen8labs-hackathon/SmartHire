import { describe, expect, it, vi } from "vitest";
import { listCandidates2 } from "@/lib/db/candidates-list2";

describe("candidate star filtering", () => {
  it.each([true, false])("applies starred=%s in SQL before pagination", async (starred) => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await listCandidates2({ query }, { starred, limit: 10, offset: 20 });
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("c.is_starred = $1");
    expect(sql.indexOf("c.is_starred = $1")).toBeLessThan(sql.indexOf("LIMIT $2 OFFSET $3"));
    expect(values).toEqual([starred, 10, 20]);
  });

  it("leaves both states visible when the filter is absent", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await listCandidates2({ query });
    expect(query.mock.calls[0][0]).not.toContain("c.is_starred =");
  });
});
