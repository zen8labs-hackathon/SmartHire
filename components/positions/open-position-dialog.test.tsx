import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenPositionDialog } from "./open-position-dialog";

const noop = () => {};

describe("OpenPositionDialog", () => {
  it("renders nothing when closed", () => {
    expect(renderToStaticMarkup(<OpenPositionDialog open={false} onClose={noop} onCreated={noop} />)).toBe("");
  });

  it("opens with Upload & extract disabled (no file) and blank link enabled (headcount 1)", () => {
    const html = renderToStaticMarkup(<OpenPositionDialog open onClose={noop} onCreated={noop} />);
    expect(html).toContain('role="dialog"');
    const buttonTag = (label: string) => html.match(new RegExp(`<button[^>]*>(?:<[^>]*>)*${label}</button>`))?.[0] ?? "";
    expect(buttonTag("Upload &amp; extract")).toContain('disabled=""');
    expect(buttonTag("No JD file\? Start from a blank form")).not.toContain('disabled=""');
    expect(html).toContain("Full-time");
    expect(html).not.toContain('role="alert"');
  });
});
