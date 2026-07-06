import React from "react";
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb";

export type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbItems?: BreadcrumbItem[];
  actions?: React.ReactNode;
};

export function PageHeader({
  title,
  description,
  breadcrumbItems,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 pb-6 border-b border-divider/60 mb-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="space-y-1 min-w-0">
          {breadcrumbItems && breadcrumbItems.length > 0 && (
            <div className="mb-1">
              <Breadcrumb items={breadcrumbItems} />
            </div>
          )}
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl truncate">
            {title}
          </h1>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2.5 mt-1 md:mt-0">
            {actions}
          </div>
        )}
      </div>
      {description && (
        <p className="text-sm text-muted max-w-3xl leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
