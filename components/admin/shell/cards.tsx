import React from "react";
import { Card } from "@heroui/react";

export type StatisticCardProps = {
  label: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    positive: boolean;
  };
  className?: string;
};

export function StatisticCard({
  label,
  value,
  description,
  icon,
  trend,
  className = "",
}: StatisticCardProps) {
  return (
    <Card
      variant="secondary"
      className={`relative overflow-hidden rounded-lg border border-divider bg-surface p-4 shadow-none ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-caption font-medium text-muted">
          {label}
        </span>
        {icon && <div className="shrink-0 text-muted">{icon}</div>}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-kpi font-semibold tabular-nums text-foreground">
          {value}
        </span>
        {trend && (
          <span
            className={`sh-chip tabular-nums ${
              trend.positive ? "sh-chip--success" : "sh-chip--danger"
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>

      {description && (
        <p className="mt-1 text-caption text-muted">
          {description}
        </p>
      )}
    </Card>
  );
}

export type SectionCardProps = {
  title?: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionCard({
  title,
  description,
  actions,
  children,
  className = "",
  contentClassName = "",
}: SectionCardProps) {
  return (
    <Card
      className={`overflow-hidden rounded-lg border border-divider bg-surface p-0 shadow-none ${className}`}
    >
      {(title || description || actions) && (
        <div className="flex flex-col gap-2 border-b border-divider px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="space-y-0.5">
            {title && (
              <h3 className="text-section font-semibold text-foreground">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-caption text-muted">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
      <div className={`p-4 ${contentClassName}`}>{children}</div>
    </Card>
  );
}
