"use client";

import { useEffect, useState } from "react";
import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import {
  pipelineSubStageSchema,
  type PipelineSubStageRow,
} from "@/lib/pipelines/schemas";

function slugifyCode(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "_")    // replace spaces/special chars with underscores
    .replace(/^_+|_+$/g, "");       // trim underscores
}

type SubStageFormProps = {
  mode: "add" | "edit";
  stageId: string;
  initialValues: PipelineSubStageRow | null;
  defaultSeq: number;
  existingSubStages: PipelineSubStageRow[];
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
  existingSubStages,
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

  const handleLabelChange = (val: string) => {
    setLabel(val);
    setCode(slugifyCode(val));
  };

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

    if (mode === "add") {
      const isDuplicate = existingSubStages.some(
        (s) => s.code.toLowerCase() === values.code.toLowerCase()
      );
      if (isDuplicate) {
        setFieldError(`A sub-stage with code '${values.code}' already exists in this stage.`);
        return;
      }
    }

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
      <h3 className="font-bold text-sm text-foreground mb-2">
        {mode === "add" ? "Add New Sub-stage" : `Edit Sub-stage: ${initialValues?.label}`}
      </h3>

      {fieldError ? (
        <p className="text-xs text-rose-500 font-semibold bg-rose-50 dark:bg-rose-950/20 p-2.5 rounded-lg border border-rose-200">
          {fieldError}
        </p>
      ) : null}

      <TextField
        isRequired
        name="label"
        value={label}
        onChange={handleLabelChange}
        validate={(v) => (!v.trim() ? "Label is required." : null)}
        className="w-full"
      >
        <Label className="text-xs font-semibold text-muted mb-1.5 block">Sub-stage Label</Label>
        <Input
          placeholder="e.g. CV Passed"
          className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/20 px-3 text-xs focus:border-accent outline-none"
        />
        <FieldError className="text-[10px] text-rose-500 mt-1" />
      </TextField>

      <TextField
        isRequired
        name="code"
        value={code}
        onChange={setCode}
        isDisabled={mode === "edit" || mode === "add"}
        validate={(v) => {
          if (!v.trim()) return "Code is required.";
          if (!/^[a-z0-9_]+$/.test(v)) {
            return "Only lowercase letters, numbers, and underscores are allowed.";
          }
          return null;
        }}
        className="w-full"
      >
        <Label className="text-xs font-semibold text-muted mb-1.5 block">Sub-stage Code</Label>
        <Input
          placeholder="e.g. cv_passed (no spaces)"
          className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/20 px-3 text-xs focus:border-accent outline-none disabled:opacity-50"
        />
        <FieldError className="text-[10px] text-rose-500 mt-1" />
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
        className="w-full"
      >
        <Label className="text-xs font-semibold text-muted mb-1.5 block">Sequence Number (Sort Order)</Label>
        <Input
          type="number"
          min={1}
          step={1}
          className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/20 px-3 text-xs focus:border-accent outline-none"
        />
        <FieldError className="text-[10px] text-rose-500 mt-1" />
      </TextField>

      <div className="flex flex-col gap-4 border-t border-divider pt-4 mt-2">
        <label className="flex items-start gap-3 cursor-pointer text-xs font-bold text-foreground select-none">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-divider bg-surface-secondary/20 text-accent focus:ring-accent accent-accent"
          />
          <div>
            <span>Default Sub-stage</span>
            <p className="text-[10px] text-muted font-semibold mt-1 leading-normal">
              New candidates in this stage will be placed in this sub-stage by default. (Only one default allowed per stage)
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer text-xs font-bold text-foreground select-none">
          <input
            type="checkbox"
            checked={isPassed}
            onChange={(e) => setIsPassed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-divider bg-surface-secondary/20 text-emerald-500 focus:ring-emerald-500 accent-emerald-500"
          />
          <div>
            <span>Passed Sub-stage</span>
            <p className="text-[10px] text-muted font-semibold mt-1 leading-normal">
              Candidates in this sub-stage are considered to have passed this stage. (At most one passed allowed per stage)
            </p>
          </div>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 mt-4">
        <Button
          variant="secondary"
          onPress={onCancel}
          isDisabled={busy}
          className="h-8 px-3.5 rounded-lg border border-divider text-xs font-bold bg-surface-secondary hover:bg-surface-secondary/80"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          isDisabled={busy}
          className="h-8 px-4 rounded-lg bg-accent text-accent-foreground text-xs font-bold hover:bg-accent/90"
        >
          {busy ? "Saving..." : "Save Sub-stage"}
        </Button>
      </div>
    </form>
  );
}
