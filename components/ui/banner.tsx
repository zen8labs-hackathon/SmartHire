import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, Sparkles, TriangleAlert } from "lucide-react";

export type BannerTone = "info" | "warning" | "danger" | "success" | "ai" | "neutral";

const ICONS = { info: Info, warning: TriangleAlert, danger: CircleAlert, success: CircleCheck, ai: Sparkles, neutral: Info };

export type BannerProps = {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Inline message. danger/warning announce immediately (role=alert), the rest politely. */
export function Banner({ tone = "info", title, children, action, className }: BannerProps) {
  const Icon = ICONS[tone];
  const urgent = tone === "danger" || tone === "warning";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={`sh-banner sh-banner--${tone}${className ? ` ${className}` : ""}`}
    >
      <Icon size={16} aria-hidden className="sh-banner__icon mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <div className="sh-banner__title">{title}</div> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
