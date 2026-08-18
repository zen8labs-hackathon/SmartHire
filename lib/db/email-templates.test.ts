import { describe, expect, it, vi } from "vitest";

import {
  createEmailTemplate,
  getEmailTemplateById,
  listEmailTemplates,
  softDeleteEmailTemplate,
  updateEmailTemplate,
} from "@/lib/db/email-templates";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getEmailTemplateById", () => {
  it("filters out soft-deleted rows", async () => {
    const row = { id: "1", name: "Welcome" };
    const db = fakeDb([row]);
    const result = await getEmailTemplateById(db, "1");
    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM email_templates WHERE id = $1 AND deleted_at IS NULL`,
      ["1"],
    );
  });
});

describe("listEmailTemplates", () => {
  it("applies default pagination with no filters", async () => {
    const db = fakeDb([]);
    await listEmailTemplates(db);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("WHERE deleted_at IS NULL");
    expect(values).toEqual([50, 0]);
  });

  it("filters by triggerTypes (category resolution happens in the caller)", async () => {
    const db = fakeDb([]);
    await listEmailTemplates(db, { triggerTypes: ["application_received", "screening_rejected"] });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("trigger_type = ANY($1)");
    expect(values[0]).toEqual(["application_received", "screening_rejected"]);
  });

  it("filters by isActive", async () => {
    const db = fakeDb([]);
    await listEmailTemplates(db, { isActive: true });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("is_active = $1");
    expect(values[0]).toBe(true);
  });
});

describe("createEmailTemplate", () => {
  it("inserts with defaults for optional fields", async () => {
    const row = { id: "1", name: "Welcome" };
    const db = fakeDb([row]);

    const result = await createEmailTemplate(db, {
      name: "Welcome",
      triggerType: "application_received",
      subjectTemplate: "Hi {{candidate_name}}",
      bodyTemplate: "<p>Body</p>",
    });

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO email_templates");
    expect(values).toEqual([
      "Welcome",
      "application_received",
      "vi",
      "Hi {{candidate_name}}",
      "<p>Body</p>",
      false,
      false,
      true,
      null,
      null,
      0,
      null,
    ]);
  });
});

describe("updateEmailTemplate", () => {
  it("only sets provided fields", async () => {
    const row = { id: "1", name: "Updated" };
    const db = fakeDb([row]);

    const result = await updateEmailTemplate(db, "1", { name: "Updated" });

    expect(result).toEqual(row);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("SET name = $2, updated_at = now()");
    expect(values).toEqual(["1", "Updated"]);
  });

  it("returns the existing row unchanged when the patch is empty", async () => {
    const row = { id: "1", name: "Same" };
    const db = fakeDb([row]);

    const result = await updateEmailTemplate(db, "1", {});

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM email_templates WHERE id = $1 AND deleted_at IS NULL`,
      ["1"],
    );
  });
});

describe("softDeleteEmailTemplate", () => {
  it("sets deleted_at", async () => {
    const db = fakeDb([{ id: "1" }]);
    await softDeleteEmailTemplate(db, "1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET deleted_at = now(), updated_at = now()"),
      ["1"],
    );
  });
});
