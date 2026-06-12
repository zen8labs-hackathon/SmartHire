import React, { type ChangeEvent } from "react";
import { Button } from "@heroui/react";
import { useJdDashboard } from "./context";

export function JdHeader() {
  const { canManageJds, jdModal, jdFileInputRef, ingestJdFile } = useJdDashboard();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Jobs list
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Manage and monitor recruitment job descriptions across the organisation.
        </p>
      </div>
      {canManageJds ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            className="bg-gradient-to-br from-[#002542] to-[#1b3b5a] shadow-sm"
            onPress={() => {
              jdModal.open();
            }}
          >
            <span className="text-lg leading-none">+</span>
            New definition
          </Button>
          <input
            ref={jdFileInputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            aria-hidden
            tabIndex={-1}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const f = e.target.files?.[0];
              if (f) void ingestJdFile(f);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
export default JdHeader;
