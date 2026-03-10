import React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-2xl border border-input/80 bg-white/90 px-4 py-2.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] outline-none transition-all duration-200 placeholder:text-muted-foreground/90 hover:border-border focus:border-primary/40 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-muted/70",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = "Input";
