import React, { type ReactNode } from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  icon,
  className
}: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      <div className="empty-state-orb">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <div className="space-y-2">
        <h3 className="text-lg">{title}</h3>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
