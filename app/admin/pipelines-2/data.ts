// Types and helpers for the Pipelines UI. Data comes from lib/pipelines/get-pipelines.

export type Sub = {
  id: string;
  label: string;
  def?: boolean;
  pass?: boolean;
  terminal?: boolean;
  reason?: boolean;
  decision?: boolean;
  withdraw?: boolean;
};

/** Known values: none | schedule | offer | probation. Stored as free text so more can be added. */
export type StageType = string;

export type Stage = {
  id: string;
  label: string;
  color: string;
  desc: string;
  schedule: boolean;
  type?: StageType;
  subs: Sub[];
  /** Soft-deleted but still used by a pipeline: shown read-only, never selectable. */
  deleted?: boolean;
};

export type PipeRow = { sid: string; sla: number; sch: boolean };
export type Pipeline = { id: string; name: string; stages: PipeRow[]; by: string; at: string; usedBy?: number };

/** The signed-in staff member; `canEdit` mirrors the server's HR-only write rule. */
export type Viewer = { name: string; role: string; canEdit: boolean };

export const SLA_DEFAULT = 5;

export const stageById = (lib: Stage[], id: string): Stage =>
  lib.find((s) => s.id === id) ?? { id, label: id, color: "var(--neutral-400)", desc: "", schedule: false, subs: [] };

export const mkRow = (lib: Stage[], sid: string): PipeRow => ({
  sid,
  sla: SLA_DEFAULT,
  sch: !!stageById(lib, sid).schedule,
});

export const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
