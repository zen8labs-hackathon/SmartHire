"use client";

import { useEffect, useState } from "react";
import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import {
  pipelineStageSchema,
  type PipelineStageRow,
} from "@/lib/pipelines/schemas";

type StageFormProps = {
  mode: "add" | "edit";
  initialValues: PipelineStageRow | null;
  onSubmit: (values: {
    code: string;
    label: string;
    desc: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
};

export function StageForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
  busy,
}: StageFormProps) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Sync initial values when editing
  useEffect(() => {
    if (mode === "edit" && initialValues) {
      setCode(initialValues.code);
      setLabel(initialValues.label);
      setDesc(initialValues.desc ?? "");
    } else {
      setCode("");
      setLabel("");
      setDesc("");
    }
    setFieldError(null);
  }, [mode, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    const values = {
      code: code.trim(),
      label: label.trim(),
      desc: desc.trim() || null,
    };

    // Client-side Zod validation
    const parsed = pipelineStageSchema.safeParse(values);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid form input.");
      return;
    }

    await onSubmit(values);
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <h3 className="font-semibold text-foreground">
        {mode === "add" ? "Add New Stage" : `Edit Stage: ${initialValues?.label}`}
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
        <Label>Stage Label</Label>
        <Input placeholder="e.g. CV Screening" />
        <FieldError />
      </TextField>

      <TextField
        isRequired
        name="code"
        value={code}
        onChange={setCode}
        isDisabled={mode === "edit"} // Disable changing code on existing stage
        validate={(v) => {
          if (!v.trim()) return "Code is required.";
          if (!/^[a-z0-9_]+$/.test(v)) {
            return "Only lowercase letters, numbers, and underscores are allowed.";
          }
          return null;
        }}
      >
        <Label>Stage Code</Label>
        <Input placeholder="e.g. cv_screening (no spaces)" />
        <FieldError />
      </TextField>

      <TextField name="desc" value={desc} onChange={setDesc}>
        <Label>Description (Optional)</Label>
        <Input placeholder="Brief description of this stage" />
        <FieldError />
      </TextField>

      <div className="flex items-center justify-end gap-3 mt-2">
        <Button variant="secondary" onPress={onCancel} isDisabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isDisabled={busy}>
          {busy ? "Saving..." : "Save Stage"}
        </Button>
      </div>
    </form>
  );
}
