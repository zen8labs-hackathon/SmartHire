"use client";

import * as React from "react";
import { EntityTabs, lsGet, lsSet } from "../position-management-2/ext";
import { Shell, Toast, type ToastMsg } from "../position-management-2/shell";
import type { Role } from "../position-management-2/data";
import type { Pipeline, Stage, Viewer } from "./data";
import { PipelineList } from "./pipeline-list";
import { StageLibrary } from "./stage-library";

export function PipelinesApp({ embedded = false, initialLibrary, initialPipelines, viewer }: { embedded?: boolean; initialLibrary: Stage[]; initialPipelines: Pipeline[]; viewer: Viewer }) {
  const [tab, setTab] = React.useState<string>("pipes");
  const [lib, setLib] = React.useState<Stage[]>(initialLibrary);
  const [list, setList] = React.useState<Pipeline[]>(initialPipelines);
  const [toast, setToast] = React.useState<ToastMsg>(null);

  React.useEffect(() => { setTab(lsGet("pl3-tab", "pipes")); }, []);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const user = { key: viewer.canEdit ? "hr" : "rc", name: viewer.name, role: viewer.role, salary: false, canCreate: viewer.canEdit, canDecide: false } as unknown as Role;
  const say = (title: string, body?: string, icon?: string) => setToast({ title, body, icon });
  const pick = (id: string) => { setTab(id); lsSet("pl3-tab", id); };

  return (
    <>
      <Shell
        embedded={embedded} onHome={() => {}} user={user} active="pipes" crumbs={["Setup"]} title="Pipelines" trail={[{ label: "Pipelines" }]}
        subtitle="Build hiring pipelines from the shared Stage library."
      >
        <EntityTabs tabs={[{ id: "pipes", label: "Pipelines", count: list.length }, { id: "library", label: "Stage library", count: lib.filter((s) => !s.deleted).length }]} value={tab} onChange={pick} />
        <div style={{ paddingTop: 16 }}>
          {tab === "library"
            ? <StageLibrary viewer={viewer} lib={lib} setLib={setLib} say={say} />
            : <PipelineList viewer={viewer} lib={lib} list={list} setList={setList} say={say} />}
        </div>
      </Shell>
      <Toast t={toast} onClose={() => setToast(null)} />
    </>
  );
}
