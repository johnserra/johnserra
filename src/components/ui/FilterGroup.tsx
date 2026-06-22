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
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 select-none uppercase tracking-wider">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}
