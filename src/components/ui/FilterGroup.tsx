import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FilterGroupProps {
  children: ReactNode;
  label?: string;
  className?: string;
}

export function FilterGroup({ children, label, className }: FilterGroupProps) {
  return (
    <div className={cn("flex flex-col gap-2 font-sans w-full text-left", className)}>
      {label && (
        <span className="text-xs font-mono text-muted select-none uppercase tracking-[0.1em]">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-2 [&_button]:rounded-pill [&_button]:border [&_button]:border-hair [&_button]:bg-transparent [&_button]:font-mono [&_button]:text-xs [&_button]:uppercase [&_button]:tracking-[0.08em] [&_button]:text-muted [&_button]:transition-colors [&_button:hover]:text-ink [&_button[aria-pressed=true]]:border-accent-dim [&_button[aria-pressed=true]]:bg-accent/10 [&_button[aria-pressed=true]]:text-accent [&_button[data-state=on]]:border-accent-dim [&_button[data-state=on]]:bg-accent/10 [&_button[data-state=on]]:text-accent">
        {children}
      </div>
    </div>
  );
}
