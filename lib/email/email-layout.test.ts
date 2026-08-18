import { describe, expect, it } from "vitest";

import { applyEmailLayout, wrapEmailBodyInCard } from "@/lib/email/email-layout";

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

describe("applyEmailLayout", () => {
  it("falls back to the default card layout when layoutType is 'default'", () => {
    const result = applyEmailLayout({
      bodyHtml: "<p>Hi</p>",
      companyName: "SmartHire",
      layoutType: "default",
    });
    expect(result).toContain("<table");
    expect(result).toContain(">SmartHire<");
  });

  it("falls back to the default card layout when layoutType is 'custom' but customLayoutHtml is blank", () => {
    const result = applyEmailLayout({
      bodyHtml: "<p>Hi</p>",
      companyName: "SmartHire",
      layoutType: "custom",
      customLayoutHtml: "   ",
    });
    expect(result).toContain("<table");
  });

  it("substitutes {{email_content}}/{{company_name}}/{{logo_url}} into the custom layout", () => {
    const result = applyEmailLayout({
      bodyHtml: "<p>Dear An, welcome aboard.</p>",
      companyName: "SmartHire",
      logoUrl: "https://cdn.example.com/logo.png",
      layoutType: "custom",
      customLayoutHtml:
        "<div><img src=\"{{logo_url}}\"><h1>{{company_name}}</h1>{{email_content}}</div>",
    });
    expect(result).toBe(
      '<div><img src="https://cdn.example.com/logo.png"><h1>SmartHire</h1><p>Dear An, welcome aboard.</p></div>',
    );
  });

  it("leaves unknown placeholders in the custom layout untouched", () => {
    const result = applyEmailLayout({
      bodyHtml: "<p>Hi</p>",
      companyName: "SmartHire",
      layoutType: "custom",
      customLayoutHtml: "{{unknown_var}}{{email_content}}",
    });
    expect(result).toBe("{{unknown_var}}<p>Hi</p>");
  });
});
