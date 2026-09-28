import { FileText } from "lucide-react";

import {
  cvFileTypeLabel,
  type CvFileInfo,
} from "@/lib/candidates/cv-file-type";

type CvFileTagProps = {
  file: CvFileInfo;
};

/**
 * Static file-type tag ("PDF", "DOCX", ...) shown next to a candidate's name.
 * Previewing the CV is done by clicking the name itself, so this is only an
 * indicator; the full file name is on hover.
 */
export function CvFileTag({ file }: CvFileTagProps) {
  const typeLabel = cvFileTypeLabel(file);
  return (
    <span
      title={file.fileName ?? undefined}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-divider bg-surface-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted"
    >
      <FileText className="size-2.5" aria-hidden />
      {typeLabel}
    </span>
  );
}
