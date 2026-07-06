import React from "react";
import { Button } from "@heroui/react";

export interface JdHeaderProps {
  canManageJds: boolean;
  /**
   * True until the Suspense-gated dashboard body (which owns the create
   * modal via `JdDashboardProvider`) has mounted and registered its bridge,
   * so this button doesn't call into a modal that isn't wired up yet.
   */
  disabled: boolean;
  onNewDefinition: () => void;
}

/**
 * Static title + "New definition" trigger for `/admin/jd`. Rendered outside
 * the Suspense boundary that gates the filters/stats/table region, so it
 * doesn't need `canManageJds` from context and can't itself suspend. Opening
 * the create modal (and the hidden file input that drives it) lives inside
 * `JdCreateModal`, reached here via the `onNewDefinition` bridge callback.
 */
export function JdHeader({ canManageJds, disabled, onNewDefinition }: JdHeaderProps) {
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
            isDisabled={disabled}
            onPress={onNewDefinition}
          >
            <span className="text-lg leading-none">+</span>
            New definition
          </Button>
        </div>
      ) : null}
    </div>
  );
}
export default JdHeader;
