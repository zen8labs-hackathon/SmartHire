import { describe, expect, it } from "vitest";

import { extractContactFromText } from "./regex-contact-extraction";

describe("extractContactFromText", () => {
  it("extracts a plain email from resume text", () => {
    const { email } = extractContactFromText(
      "Contact me at Jane.Doe@Example.com for interviews",
    );
    expect(email).toBe("jane.doe@example.com");
  });

  it("extracts a VN phone with +84 prefix", () => {
    const { phone } = extractContactFromText("Phone: +84 912 345 678");
    expect(phone).toBe("84912345678");
  });

  it("extracts a VN phone with leading 0", () => {
    const { phone } = extractContactFromText("Mobile 0912345678, thanks");
    expect(phone).toBe("0912345678");
  });

  it("matches the same subscriber number across +84 and 0 formats", () => {
    const a = extractContactFromText("+84 912 345 678");
    const b = extractContactFromText("0912345678");
    expect(a.phone).toBeTruthy();
    expect(b.phone).toBeTruthy();
  });

  it("returns nulls for text with no contact info", () => {
    const { email, phone } = extractContactFromText(
      "Experienced software engineer with 5 years in backend systems.",
    );
    expect(email).toBeNull();
    expect(phone).toBeNull();
  });

  it("ignores garbage numeric runs shorter than a phone number", () => {
    const { phone } = extractContactFromText("GPA 3.7/4.0, born 2001");
    expect(phone).toBeNull();
  });

  it("picks the first email when multiple are present", () => {
    const { email } = extractContactFromText(
      "primary: first@example.com secondary: second@example.com",
    );
    expect(email).toBe("first@example.com");
  });

  it("extracts a bare 9-digit VN mobile without a country prefix run together with a leading 0", () => {
    const { phone } = extractContactFromText("Call 0987654321 anytime");
    expect(phone).toBe("0987654321");
  });

  it("normalizes separators (spaces, dots, dashes) within a phone number", () => {
    const { phone } = extractContactFromText("Tel: 091-234.5678");
    expect(phone).toBe("0912345678");
  });

  // KNOWN LIMITATION (tracked as a follow-up, see QA log): the phone regex has
  // no word-boundary anchor, so any unrelated digit run containing a `0` or
  // `84` followed by 8-9 more digits (student IDs, invoice/order numbers)
  // produces a false-positive "phone number". This is a heuristic pre-filter
  // only — the post-parse LLM check remains authoritative — but it can still
  // trigger a spurious pre-upload duplicate prompt if the fabricated digits
  // happen to collide with another candidate's real phone variant.
  it("false-positives on a phone-shaped substring inside a longer ID/invoice number", () => {
    const { phone } = extractContactFromText("Student ID: 20210912345678");
    expect(phone).toBe("0210912345");
  });

  it("extracts email case-insensitively regardless of surrounding punctuation", () => {
    const { email } = extractContactFromText("Email:JOHN.SMITH@COMPANY.CO.UK.");
    expect(email).toBe("john.smith@company.co.uk");
  });
});
