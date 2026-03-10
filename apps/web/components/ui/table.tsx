import React, {
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes
} from "react";

import { cn } from "@/lib/utils";

export function Table({
  className,
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("data-table", className)} {...props} />;
}

export function Th({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-border/60 px-4 py-3 first:pl-5 last:pr-5",
        className
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-border/60 px-4 py-3.5 align-top first:pl-5 last:pr-5",
        className
      )}
      {...props}
    />
  );
}
