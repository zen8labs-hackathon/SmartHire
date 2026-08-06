import { describe, expect, it } from "vitest";

import type { PublicUserRow } from "@/lib/db/users";
import { composeSelfNotificationEmail } from "@/lib/email/compose-self-notification";

const recipient: PublicUserRow = {
  id: "u1",
  email: "new.hire@smart-hire.test",
  username: "newhire",
  role: "hr",
  display_name: "Nguyen Van B",
  phone: null,
  created_at: new Date(),
  deleted_at: null,
};

describe("composeSelfNotificationEmail", () => {
  it("returns null when the recipient has no email", () => {
    const result = composeSelfNotificationEmail(
      { ...recipient, email: "" },
      "Welcome",
      "Hi {{receiver_name}}",
    );
    expect(result).toBeNull();
  });

  it("addresses the recipient's own email and fills receiver_name/receiver_email", () => {
    const result = composeSelfNotificationEmail(
      recipient,
      "Welcome to {{company_name}}",
      "<p>Hi {{receiver_name}}, your account is {{receiver_email}}.</p>",
      { companyName: "SmartHire" },
    );
    expect(result?.toEmail).toBe("new.hire@smart-hire.test");
    expect(result?.subject).toBe("Welcome to SmartHire");
    expect(result?.bodyHtml).toContain("Hi Nguyen Van B, your account is new.hire@smart-hire.test.");
  });

  it("falls back to username when display_name is not set", () => {
    const result = composeSelfNotificationEmail(
      { ...recipient, display_name: null },
      "Welcome",
      "Hi {{receiver_name}}",
    );
    expect(result?.bodyHtml).toContain("Hi newhire");
  });

  it("fills user_name/user_email/user_phone from actingUser when provided", () => {
    const result = composeSelfNotificationEmail(recipient, "Welcome", "Invited by {{user_name}} ({{user_email}})", {
      actingUser: { name: "Admin A", email: "admin@smart-hire.test", phone: "0900000000" },
    });
    expect(result?.bodyHtml).toContain("Invited by Admin A (admin@smart-hire.test)");
  });

  it("leaves user_name/user_email/user_phone empty when actingUser is absent (self-provisioned signup)", () => {
    const result = composeSelfNotificationEmail(recipient, "Welcome", "Invited by [{{user_name}}]");
    expect(result?.bodyHtml).toContain("Invited by []");
  });
});
