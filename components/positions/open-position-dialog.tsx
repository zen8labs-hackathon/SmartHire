"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Cpu, FileText, FileUp, Pencil, Sparkles } from "lucide-react";
import { Banner, Button } from "@/components/ui";
import {
  DEFAULT_HIRE_TYPE,
  HIRE_TYPES,
  POSITION_JD_EXTENSIONS,
  createPositionState,
  validateHeadcount,
  validateJdFile,
} from "@/lib/position/position-rules";
import { useOpenPosition } from "./use-open-position";

export type OpenPositionDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the new position id after a successful create. */
  onCreated: (id: string) => void;
};

export function OpenPositionDialog({ open, onClose, onCreated }: OpenPositionDialogProps) {
  const titleId = useId();
  const fileId = useId();
  const hcId = useId();
  const hireId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headcount, setHeadcount] = useState("1");
  const [hireType, setHireType] = useState<string>(DEFAULT_HIRE_TYPE);
  const [dragOver, setDragOver] = useState(false);
  const { submit, submitting, error, clearError } = useOpenPosition();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    setFile(null);
    setHeadcount("1");
    setHireType(DEFAULT_HIRE_TYPE);
    setDragOver(false);
    clearError();
    ref.current?.querySelector<HTMLElement>("button, input, select")?.focus();
    return () => opener?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const fileError = file ? validateJdFile({ name: file.name, size: file.size }) : null;
  const hc = validateHeadcount(headcount);
  const state = createPositionState({
    fileValid: Boolean(file) && !fileError,
    headcountValid: !hc.error,
  });

  const run = async (withFile: boolean) => {
    if (hc.value == null || submitting) return;
    const id = await submit({ file: withFile ? file : null, headcount: hc.value, hireType });
    if (id) onCreated(id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!submitting) onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const f = ref.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
    );
    if (!f || f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const steps = [
    { icon: null, title: "Upload JD", sub: "You · now" },
    { icon: Cpu, title: "System extracts", sub: "Document + AI · < 1 min" },
    { icon: Pencil, title: "Review on position page", sub: "Edit fields & criteria" },
  ];
  const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const pickFile = () => fileRef.current?.click();

  return (
    <div className="sh-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sh-dialog max-w-[620px]"
        onKeyDown={onKeyDown}
      >
        <div className="sh-dialog__head">
          <div>
            <h2 id={titleId} className="sh-dialog__title">Open new position</h2>
            <p className="sh-dialog__desc">
              Upload the JD. SmartHire extracts the text and uses AI to fill position fields and scoring criteria. You review and edit everything on the position page before it opens.
            </p>
          </div>
        </div>

        <div className="sh-dialog__body flex flex-col gap-4">
          {error ? <Banner tone="danger" title="Could not create position">{error}</Banner> : null}

          <ol className="jb-stepper" aria-label="Steps">
            {steps.map((st, i) => {
              const Icon = st.icon;
              return (
                <li key={st.title} className={i === 0 ? "is-cur" : undefined} aria-current={i === 0 ? "step" : undefined}>
                  <span className="jb-stepper__dot" aria-hidden>
                    {Icon ? <Icon className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="jb-stepper__txt">
                    <b>{st.title}</b>
                    <small>{st.sub}</small>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="sh-field">
            <input
              ref={fileRef}
              id={fileId}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-label="Job description file"
              accept={POSITION_JD_EXTENSIONS.join(",")}
              aria-invalid={fileError ? true : undefined}
              aria-describedby={fileError ? `${fileId}-err` : undefined}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="jb-file">
                <FileText className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-body font-semibold">{file.name}</b>
                  <small className="text-caption text-muted">{sizeLabel(file.size)} · {fileError ? "cannot be uploaded" : "ready to upload"}</small>
                </div>
                <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" onClick={pickFile} disabled={submitting}>
                  Replace
                </button>
              </div>
            ) : (
              <div
                className={`jb-drop${dragOver ? " is-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) setFile(dropped);
                }}
              >
                <FileUp className="h-5 w-5" aria-hidden />
                <b>Drag a JD file here</b>
                <span>PDF or DOCX · max 10 MB · one file per position</span>
                <button type="button" className="sh-btn sh-btn--secondary sh-btn--sm" onClick={pickFile}>
                  Choose file
                </button>
              </div>
            )}
            {fileError ? <span id={`${fileId}-err`} role="alert" className="sh-field__error">{fileError}</span> : null}
          </div>

          <div className="jb-form">
            <div className="sh-field">
              <label htmlFor={hireId} className="sh-field__label">Hire type</label>
              <div className="sh-input">
                <select id={hireId} value={hireType} onChange={(e) => setHireType(e.target.value)}>
                  {HIRE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sh-field">
              <label htmlFor={hcId} className="sh-field__label">Headcount</label>
              <div className={`sh-input${state.showHeadcountError ? " sh-input--invalid" : ""}`}>
                <input
                  id={hcId}
                  inputMode="numeric"
                  value={headcount}
                  onChange={(e) => setHeadcount(e.target.value)}
                  aria-invalid={state.showHeadcountError ? true : undefined}
                  aria-describedby={state.showHeadcountError ? `${hcId}-err` : `${hcId}-hint`}
                />
                <span className="text-caption text-muted">people</span>
              </div>
              {state.showHeadcountError ? (
                <span id={`${hcId}-err`} role="alert" className="sh-field__error">{hc.error}</span>
              ) : (
                <span id={`${hcId}-hint`} className="sh-field__hint">How many hires this position needs. You can change it later.</span>
              )}
            </div>
          </div>

          <p className="m-0 text-caption text-muted">
            The position is saved as a draft right away. Extraction takes under a minute; you can leave the page and get a notification when it&rsquo;s ready.
          </p>
        </div>

        <div className="sh-dialog__foot">
          <button
            type="button"
            className="mr-auto text-[13px] text-accent underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
            disabled={!state.blankLinkEnabled || submitting}
            onClick={() => run(false)}
          >
            No JD file? Start from a blank form
          </button>
          <button type="button" className="sh-btn sh-btn--secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <Button icon={Sparkles} disabled={!state.uploadEnabled} loading={submitting} onClick={() => run(true)}>
            Upload &amp; extract
          </Button>
        </div>
      </div>
    </div>
  );
}
