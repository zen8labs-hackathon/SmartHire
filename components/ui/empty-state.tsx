import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox, TriangleAlert } from "lucide-react";

type StateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
};

function StateShell({ title, description, action, icon: Icon, tone, role, className }: StateProps & { tone: string; role?: "alert"; icon: LucideIcon }) {
  return (
    <div role={role} className={`flex flex-col items-center gap-2 px-6 py-12 text-center${className ? ` ${className}` : ""}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}>
        <Icon size={20} aria-hidden />
      </span>
      <h3 className="text-section font-semibold text-heading">{title}</h3>
      {description ? <p className="max-w-[420px] text-body text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Nothing to show yet. Always say what to do next (action) or why it is empty. */
export function EmptyState({ icon = Inbox, ...p }: StateProps) {
  return <StateShell {...p} icon={icon} tone="bg-surface-subtle text-muted" />;
}

/** Load failed. Give a specific reason and a retry action, never just "Error". */
export function ErrorState({ icon = TriangleAlert, ...p }: StateProps) {
  return <StateShell {...p} icon={icon} role="alert" tone="bg-danger-soft text-danger" />;
}
