import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { publicUrlFromRequest } from "./public-url";

function req(headers: Record<string, string>) {
  return new NextRequest("http://0.0.0.0:3100/admin", { headers });
}

describe("publicUrlFromRequest", () => {
  it("drops the internal port when Host has none", () => {
    const url = publicUrlFromRequest(req({ host: "smart-hire.zen8labs.io" }));
    expect(url.origin).toBe("https://smart-hire.zen8labs.io");
  });

  it("keeps a port supplied by the header", () => {
    const url = publicUrlFromRequest(
      req({ "x-forwarded-host": "example.com:8443", "x-forwarded-proto": "https" }),
    );
    expect(url.origin).toBe("https://example.com:8443");
  });
});
