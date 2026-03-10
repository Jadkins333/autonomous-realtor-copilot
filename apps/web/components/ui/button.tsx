import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 active:translate-y-[1px]",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-lift hover:-translate-y-0.5 hover:brightness-[1.03]",
        outline:
          "border-border/80 bg-white/80 text-foreground shadow-soft hover:-translate-y-0.5 hover:bg-backgroundAlt hover:text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
        secondary:
          "border-secondary/80 bg-secondary/90 text-secondary-foreground hover:-translate-y-0.5 hover:bg-secondary",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground shadow-soft hover:-translate-y-0.5 hover:brightness-[1.03]"
      },
      size: {
        default: "h-11 px-4 py-2.5",
        sm: "h-9 rounded-xl px-3.5 text-[0.82rem]",
        lg: "h-12 px-5 text-base",
        icon: "h-11 w-11 rounded-2xl"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
