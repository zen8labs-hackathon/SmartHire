"use client";

import { useEffect, useState } from "react";
import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import {
  pipelineStageSchema,
  type PipelineStageRow,
} from "@/lib/pipelines/schemas";

function slugifyCode(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "_")    // replace spaces/special chars with underscores
    .replace(/^_+|_+$/g, "");       // trim underscores
}

type StageFormProps = {
  mode: "add" | "edit";
  initialValues: PipelineStageRow | null;
  existingStages: PipelineStageRow[];
  onSubmit: (values: {
    code: string;
    label: string;
    desc: string | null;
    color: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
};

const PRESET_COLORS = [
  { name: "sky", class: "bg-sky-500" },
  { name: "violet", class: "bg-violet-500" },
  { name: "teal", class: "bg-teal-500" },
  { name: "emerald", class: "bg-emerald-500" },
  { name: "rose", class: "bg-rose-500" },
  { name: "amber", class: "bg-amber-500" },
  { name: "zinc", class: "bg-zinc-500" },
];

export function StageForm({
  mode,
  initialValues,
  existingStages,
  onSubmit,
  onCancel,
  busy,
}: StageFormProps) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState("zinc");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleLabelChange = (val: string) => {
    setLabel(val);
    setCode(slugifyCode(val));
  };

  // Sync initial values when editing
  useEffect(() => {
    if (mode === "edit" && initialValues) {
      setCode(initialValues.code);
      setLabel(initialValues.label);
      setDesc(initialValues.desc ?? "");
      setColor(initialValues.color ?? "zinc");
    } else {
      setCode("");
      setLabel("");
      setDesc("");
      setColor("zinc");
    }
    setFieldError(null);
  }, [mode, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    const trimmedColor = color.trim();

    // Verify custom color validity (must be preset or a valid 6-char hex code starting with #)
    const isPreset = PRESET_COLORS.some((p) => p.name === trimmedColor);
    const isHex = /^#[0-9a-fA-F]{6}$/.test(trimmedColor);

    if (!isPreset && !isHex) {
      setFieldError(
        "Please enter a valid hex color code (e.g. #002542) or select a preset color."
      );
      return;
    }

    const values = {
      code: code.trim(),
      label: label.trim(),
      desc: desc.trim() || null,
      color: trimmedColor || null,
    };

    if (mode === "add") {
      const isDuplicate = existingStages.some(
        (s) => s.code.toLowerCase() === values.code.toLowerCase()
      );
      if (isDuplicate) {
        setFieldError(`A stage with code '${values.code}' already exists.`);
        return;
      }
    }

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
      <h3 className="font-bold text-sm text-foreground mb-2">
        {mode === "add" ? "Add New Stage" : `Edit Stage: ${initialValues?.label}`}
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
        <Label className="text-xs font-semibold text-muted mb-1.5 block">Stage Label</Label>
        <Input
          placeholder="e.g. CV Screening"
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
        <Label className="text-xs font-semibold text-muted mb-1.5 block">Stage Code</Label>
        <Input
          placeholder="Stage code will be auto-generated"
          className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/20 px-3 text-xs focus:border-accent outline-none disabled:opacity-50"
        />
        <FieldError className="text-[10px] text-rose-500 mt-1" />
      </TextField>

      <TextField name="desc" value={desc} onChange={setDesc} className="w-full">
        <Label className="text-xs font-semibold text-muted mb-1.5 block">Description (Optional)</Label>
        <Input
          placeholder="Brief description of this stage"
          className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/20 px-3 text-xs focus:border-accent outline-none"
        />
        <FieldError className="text-[10px] text-rose-500 mt-1" />
      </TextField>

      {/* Color Selection UI */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold text-muted mb-1">Stage Color</Label>
        <div className="flex flex-wrap items-center gap-3 bg-surface-secondary/10 p-3 rounded-xl border border-divider">
          {PRESET_COLORS.map((preset) => {
            const isSelected = color === preset.name;
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => setColor(preset.name)}
                className={`group relative flex size-7 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none ${preset.class}`}
                aria-label={`Select ${preset.name} color`}
              >
                {isSelected && (
                  <span className="size-2 rounded-full bg-white shadow-sm animate-pulse" />
                )}
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                  {preset.name}
                </span>
              </button>
            );
          })}

          <div className="flex items-center gap-2 border border-divider rounded-lg px-2 py-1 bg-surface-primary">
            <input
              type="color"
              value={color.startsWith("#") ? color : "#71717a"}
              onChange={(e) => setColor(e.target.value)}
              className="size-6 cursor-pointer border-none bg-transparent outline-none rounded"
              title="Choose custom color"
            />
            <input
              type="text"
              value={color.startsWith("#") ? color : ""}
              placeholder="#71717A"
              onChange={(e) => setColor(e.target.value)}
              className="w-20 bg-transparent text-xs outline-none text-foreground placeholder-muted font-mono"
            />
          </div>
        </div>
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
          className="h-8 px-4 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent/90"
        >
          {busy ? "Saving..." : "Save Stage"}
        </Button>
      </div>
    </form>
  );
}
