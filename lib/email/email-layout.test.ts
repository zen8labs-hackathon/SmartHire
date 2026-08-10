import { describe, expect, it } from "vitest";

import { wrapEmailBodyInCard } from "@/lib/email/email-layout";

describe("wrapEmailBodyInCard", () => {
  it("embeds the body html unchanged inside the card", () => {
    const result = wrapEmailBodyInCard({
      bodyHtml: "<p>Dear An, welcome aboard.</p>",
      companyName: "SmartHire",
    });
    expect(result).toContain("<p>Dear An, welcome aboard.</p>");
  });

  it("shows the company name as text when no logo is configured", () => {
    const result = wrapEmailBodyInCard({ bodyHtml: "<p>Hi</p>", companyName: "SmartHire" });
    expect(result).toContain(">SmartHire<");
    expect(result).not.toContain("<img");
  });

  it("renders both the logo image and the company name when logoUrl is set", () => {
    const result = wrapEmailBodyInCard({
      bodyHtml: "<p>Hi</p>",
      companyName: "SmartHire",
      logoUrl: "https://cdn.example.com/logo.png",
    });
    expect(result).toContain('src="https://cdn.example.com/logo.png"');
    expect(result).toContain(">SmartHire<");
  });

  it("uses table-based layout with inline styles only (no <style> block, no flex/grid)", () => {
    const result = wrapEmailBodyInCard({ bodyHtml: "<p>Hi</p>", companyName: "SmartHire" });
    expect(result).not.toContain("<style");
    expect(result).not.toContain("display:flex");
    expect(result).not.toContain("display:grid");
    expect(result).toContain("<table");
  });
});
