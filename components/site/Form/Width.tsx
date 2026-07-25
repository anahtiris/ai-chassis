import * as React from "react";
import { cn } from "@/lib/utils";

// Every field component (Text, Textarea, Select, Country, State, Number,
// Email, Checkbox, Message) wraps its Label + input in this — the vertical
// gap between them lives here, once, rather than repeated in each field.
export const Width: React.FC<{
  children: React.ReactNode;
  className?: string;
  width?: number | string;
}> = ({ children, className, width }) => {
  return (
    <div
      className={cn("flex flex-col gap-1.5", className)}
      style={{ maxWidth: width ? `${width}%` : undefined }}
    >
      {children}
    </div>
  );
};
