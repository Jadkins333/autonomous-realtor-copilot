import React from "react";

import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "default", variant = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition",
          size === "sm" && "px-3 py-1.5 text-xs",
          variant === "default" && "bg-primary text-primary-foreground hover:opacity-90",
          variant === "outline" && "border bg-card hover:bg-muted",
          variant === "ghost" && "hover:bg-muted",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
