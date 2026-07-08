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
      className={`relative overflow-hidden border border-divider/60 bg-surface-secondary/35 p-5 transition-all duration-200 hover:border-accent/30 hover:bg-surface-secondary/50 shadow-sm rounded-2xl ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        {icon && <div className="text-muted/70 shrink-0">{icon}</div>}
      </div>
      
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {value}
        </span>
        {trend && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend.positive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-danger/10 text-danger"
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>

      {description && (
        <p className="mt-2 text-xs text-muted leading-relaxed font-medium">
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
      className={`border border-divider/60 bg-surface-primary shadow-md shadow-black/5 rounded-2xl overflow-hidden ${className}`}
    >
      {(title || description || actions) && (
        <div className="flex flex-col gap-2 border-b border-divider/60 bg-surface-secondary/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="space-y-1">
            {title && (
              <h3 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-muted leading-normal">
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
      <div className={`p-5 ${contentClassName}`}>{children}</div>
    </Card>
  );
}
