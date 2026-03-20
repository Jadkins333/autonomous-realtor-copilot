import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline" | "destructive";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
        variant === "default" && "bg-muted text-muted-foreground",
        variant === "secondary" && "bg-slate-700/60 text-slate-100",
        variant === "outline" && "border border-border bg-transparent text-muted-foreground",
        variant === "destructive" && "bg-red-500/15 text-red-200",
        className
      )}
      {...props}
    />
  );
}
