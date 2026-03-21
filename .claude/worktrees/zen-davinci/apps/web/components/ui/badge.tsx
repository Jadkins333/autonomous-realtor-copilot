import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-muted text-muted-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-input bg-transparent text-foreground",
  destructive: "bg-destructive text-destructive-foreground",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
