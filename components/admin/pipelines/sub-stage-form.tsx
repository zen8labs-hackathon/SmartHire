"use client";

import { useEffect, useState } from "react";
import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import {
  pipelineSubStageSchema,
  type PipelineSubStageRow,
} from "@/lib/pipelines/schemas";

type SubStageFormProps = {
  mode: "add" | "edit";
  stageId: string;
  initialValues: PipelineSubStageRow | null;
  defaultSeq: number;
  onSubmit: (values: {
    code: string;
    label: string;
    sequence_number: number;
    is_default: boolean;
    is_passed: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
};

export function SubStageForm({
  mode,
  stageId,
  initialValues,
  defaultSeq,
  onSubmit,
  onCancel,
  busy,
}: SubStageFormProps) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [seq, setSeq] = useState<number>(1);
  const [isDefault, setIsDefault] = useState(false);
  const [isPassed, setIsPassed] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "edit" && initialValues) {
      setCode(initialValues.code);
      setLabel(initialValues.label);
      setSeq(initialValues.sequence_number);
      setIsDefault(initialValues.is_default);
      setIsPassed(initialValues.is_passed);
    } else {
      setCode("");
      setLabel("");
      setSeq(defaultSeq);
      setIsDefault(false);
      setIsPassed(false);
    }
    setFieldError(null);
  }, [mode, initialValues, defaultSeq]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    const values = {
      pipeline_stage_id: stageId,
      code: code.trim(),
      label: label.trim(),
      sequence_number: Number(seq),
      is_default: isDefault,
      is_passed: isPassed,
    };

    // Client-side Zod validation
    const parsed = pipelineSubStageSchema.safeParse(values);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid form input.");
      return;
    }

    await onSubmit({
      code: values.code,
      label: values.label,
      sequence_number: values.sequence_number,
      is_default: values.is_default,
      is_passed: values.is_passed,
    });
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <h3 className="font-semibold text-foreground">
        {mode === "add" ? "Add New Sub-stage" : `Edit Sub-stage: ${initialValues?.label}`}
      </h3>

      {fieldError ? (
        <p className="text-xs text-danger font-medium">{fieldError}</p>
      ) : null}

      <TextField
        isRequired
        name="label"
        value={label}
        onChange={setLabel}
        validate={(v) => (!v.trim() ? "Label is required." : null)}
      >
        <Label>Sub-stage Label</Label>
        <Input placeholder="e.g. CV Passed" />
        <FieldError />
      </TextField>

      <TextField
        isRequired
        name="code"
        value={code}
        onChange={setCode}
        isDisabled={mode === "edit"} // Disable changing code on existing sub-stage
        validate={(v) => {
          if (!v.trim()) return "Code is required.";
          if (!/^[a-z0-9_]+$/.test(v)) {
            return "Only lowercase letters, numbers, and underscores are allowed.";
          }
          return null;
        }}
      >
        <Label>Sub-stage Code</Label>
        <Input placeholder="e.g. cv_passed (no spaces)" />
        <FieldError />
      </TextField>

      <TextField
        isRequired
        name="sequence_number"
        type="number"
        value={String(seq)}
        onChange={(v) => setSeq(Number(v))}
        validate={(v) => {
          const n = Number(v);
          if (Number.isNaN(n) || n < 1) return "Must be a valid positive integer.";
          return null;
        }}
      >
        <Label>Sequence Number (Sort Order)</Label>
        <Input type="number" min={1} step={1} />
        <FieldError />
      </TextField>

      <div className="flex flex-col gap-4 border-t border-divider pt-4 mt-2">
        <label className="flex items-start gap-3 cursor-pointer text-sm font-medium text-foreground select-none">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 bg-background text-accent focus:ring-accent accent-accent"
          />
          <div>
            <span>Default Sub-stage</span>
            <p className="text-xs text-muted font-normal mt-0.5">
              New candidates in this stage will be placed in this sub-stage by default. (Only one default allowed per stage)
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer text-sm font-medium text-foreground select-none">
          <input
            type="checkbox"
            checked={isPassed}
            onChange={(e) => setIsPassed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 bg-background text-success focus:ring-success accent-success"
          />
          <div>
            <span>Passed Sub-stage</span>
            <p className="text-xs text-muted font-normal mt-0.5">
              Candidates in this sub-stage are considered to have passed this stage. (At most one passed allowed per stage)
            </p>
          </div>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 mt-2">
        <Button variant="secondary" onPress={onCancel} isDisabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isDisabled={busy}>
          {busy ? "Saving..." : "Save Sub-stage"}
        </Button>
      </div>
    </form>
  );
}
