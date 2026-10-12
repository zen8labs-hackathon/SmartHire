import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiLabel, FitSignal, RestrictedValue, describeAiSource } from "@/components/ui";

describe("F0.4 patterns", () => {
  it("describes AI sources", () => {
    expect(describeAiSource({ kind: "jd", page: 3 })).toBe("From JD p.3");
    expect(describeAiSource({ kind: "cv" })).toBe("Quoted from CV");
  });
  it("AI label with provenance is a button and flags unconfirmed", () => {
    const html = renderToStaticMarkup(
      <AiLabel provenance={{ model: "m", generatedAt: "2026-10-08T01:02:00Z", state: "unconfirmed" }} />,
    );
    expect(html).toContain("<button");
    expect(html).toContain("unconfirmed");
  });
  it("edited provenance uses the edited style", () => {
    const html = renderToStaticMarkup(
      <AiLabel provenance={{ model: "m", generatedAt: "2026-10-08T01:02:00Z", state: "edited" }} />,
    );
    expect(html).toContain("sh-ailabel--edited");
  });
  it("restricted value shows a chip with reason, not the value", () => {
    const html = renderToStaticMarkup(
      <RestrictedValue value={{ restricted: true, reason: "HR only" }}>{(v: string) => v}</RestrictedValue>,
    );
    expect(html).toContain("Restricted");
    expect(html).toContain("HR only");
  });
  it("fit signal puts level before score, no red, with caption", () => {
    const html = renderToStaticMarkup(<FitSignal score={82} />);
    expect(html.indexOf("Strong match")).toBeLessThan(html.indexOf(">82<"));
    expect(html).toContain("One signal, not a ranking");
    expect(html).not.toMatch(/danger|red/i);
  });
});
