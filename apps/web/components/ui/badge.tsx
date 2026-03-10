import React, { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold tracking-[0.02em] transition-colors duration-200",
  {
    variants: {
      variant: {
        default:
          "border-secondary/90 bg-secondary/85 text-secondary-foreground",
        secondary: "border-primary/10 bg-primary/10 text-primary",
        outline: "border-border/80 bg-white/80 text-foreground",
        destructive: "border-destructive/20 bg-destructive/10 text-destructive",
        success: "border-success/20 bg-success/10 text-success",
        warning: "border-warning/20 bg-warning/10 text-warning-foreground",
        info: "border-info/20 bg-info/10 text-info"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
