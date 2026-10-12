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
    <div className="mb-4 flex flex-col gap-1 pb-1">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="min-w-0 space-y-1">
          {breadcrumbItems && breadcrumbItems.length > 0 && (
            <div>
              <Breadcrumb items={breadcrumbItems} />
            </div>
          )}
          <h1 className="truncate text-page font-semibold text-heading">
            {title}
          </h1>
        </div>
        {actions && (
          <div className="mt-1 flex shrink-0 items-center gap-2 md:mt-0">
            {actions}
          </div>
        )}
      </div>
      {description && (
        <p className="max-w-3xl text-body text-muted">
          {description}
        </p>
      )}
    </div>
  );
}
