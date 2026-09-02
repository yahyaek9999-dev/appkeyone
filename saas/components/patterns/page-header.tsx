import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /**
   * Override the actions wrapper's classes. Default is `shrink-0` (actions
   * sit at their natural width beside the title). Pages with many action
   * items (search form + several links) should pass something like
   * `"w-full flex-wrap sm:w-auto"` so the row can wrap instead of
   * overflowing the viewport on narrow screens — `shrink-0` alone does not
   * allow a flex item's own children to wrap against the parent's width.
   */
  actionsClassName?: string;
}

function PageHeader({ title, description, actions, className, actionsClassName }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="page-desc mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className={cn("flex shrink-0 items-center gap-2", actionsClassName)}>{actions}</div>
      )}
    </div>
  );
}

export { PageHeader };
