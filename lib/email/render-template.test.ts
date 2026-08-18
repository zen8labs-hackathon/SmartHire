import { describe, expect, it } from "vitest";

import {
  findUnresolvedPlaceholders,
  renderEmailSubjectAndBody,
  renderEmailTemplate,
} from "@/lib/email/render-template";

describe("renderEmailTemplate", () => {
  it("substitutes known placeholders", () => {
    const result = renderEmailTemplate("Hi {{candidate_name}}, welcome to {{company_name}}.", {
      candidate_name: "An",
      company_name: "SmartHire",
    });
    expect(result).toBe("Hi An, welcome to SmartHire.");
  });

  it("leaves unknown placeholders untouched", () => {
    const result = renderEmailTemplate("Hi {{candidate_name}}, {{unknown_var}}", {
      candidate_name: "An",
    });
    expect(result).toBe("Hi An, {{unknown_var}}");
  });

  it("substitutes an empty string when the value is explicitly empty", () => {
    const result = renderEmailTemplate("Location: {{interview_location}}", {
      interview_location: "",
    });
    expect(result).toBe("Location: ");
  });

  it("tolerates extra whitespace inside the placeholder", () => {
    const result = renderEmailTemplate("Hi {{ candidate_name }}", { candidate_name: "An" });
    expect(result).toBe("Hi An");
  });
});

describe("renderEmailSubjectAndBody", () => {
  it("renders subject and body independently", () => {
    const result = renderEmailSubjectAndBody(
      "Offer for {{position}}",
      "<p>Dear {{candidate_name}}</p>",
      { position: "Backend Engineer", candidate_name: "An" },
    );
    expect(result).toEqual({
      subject: "Offer for Backend Engineer",
      bodyHtml: "<p>Dear An</p>",
    });
  });
});

describe("findUnresolvedPlaceholders", () => {
  it("returns an empty array when every placeholder was resolved", () => {
    const result = findUnresolvedPlaceholders(renderEmailTemplate("Hi {{candidate_name}}", {
      candidate_name: "An",
    }));
    expect(result).toEqual([]);
  });

  it("returns each distinct unresolved placeholder", () => {
    const result = findUnresolvedPlaceholders(
      "Hi {{candidate_name}}, interview at {{interview_date}} for {{position}}",
    );
    expect(result).toEqual(["{{candidate_name}}", "{{interview_date}}", "{{position}}"]);
  });

  it("de-duplicates repeated placeholders", () => {
    const result = findUnresolvedPlaceholders("{{position}} -- {{position}} again");
    expect(result).toEqual(["{{position}}"]);
  });
});
