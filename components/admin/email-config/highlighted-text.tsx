"use client";

import { Fragment } from "react";

/** Capturing group keeps the `{{key}}` matches in the `.split()` result
 * (at odd indices), interleaved with the surrounding plain-text segments. */
const PLACEHOLDER_PATTERN = /(\{\{\s*\w+\s*\}\})/g;

/**
 * Plain-text counterpart to `highlightUnresolvedPlaceholdersHtml` for
 * contexts that render as text rather than HTML (e.g. an email's subject
 * line) -- highlights any leftover `{{key}}` placeholder the same way.
 */
export function HighlightedText({ text }: { text: string }) {
  const parts = text.split(PLACEHOLDER_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-danger/10 px-0.5 font-semibold text-danger">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
