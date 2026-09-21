"use client";

import { FileText } from "lucide-react";

import {
  cvFileTypeLabel,
  type CvFileInfo,
} from "@/lib/candidates/cv-file-type";

type CvFileTagProps = {
  file: CvFileInfo;
  onOpen: () => void;
};

/**
 * File-type tag ("PDF", "DOCX", ...) that asks its owner to open a CV preview.
 * Purely presentational -- the modal lives with the parent, like the table's
 * other row modals. Styled after the jobs list's "JD file" tag and is a plain
 * `<button>` like it: HeroUI's `Button` brings its own variant hover styles
 * that fight custom hover classes. Must stay a sibling of the candidate-name
 * link, never inside it, or a click bubbles into the anchor and navigates.
 */
export function CvFileTag({ file, onOpen }: CvFileTagProps) {
  const typeLabel = cvFileTypeLabel(file);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={file.fileName ? `Preview ${file.fileName}` : "Preview CV file"}
      aria-label={`Preview CV file (${typeLabel})`}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-divider bg-surface-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted transition-colors hover:bg-surface-tertiary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <FileText className="size-2.5" aria-hidden />
      {typeLabel}
    </button>
  );
}
