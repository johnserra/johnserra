import { cn } from "@/lib/utils";
import { BentoBoxProps } from "@/types";

export function BentoBox({
  children,
  span = 4,
  rowSpan = 1,
  className,
  variant = "default",
}: BentoBoxProps) {
  const variantClasses = {
    default: "bg-carbon-gray-10 dark:bg-carbon-gray-90 border border-carbon-gray-20 dark:border-zinc-800",
    gradient: "bg-gradient-to-br from-zinc-50 to-blue-50/30 dark:from-zinc-950 dark:to-blue-950/20 border border-zinc-200 dark:border-zinc-800",
    glass: "bg-white/60 dark:bg-carbon-gray-100/40 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-800/50",
  };

  return (
    <div
      className={cn(
        "rounded-[var(--radius-bento)] p-6 transition-all duration-200",
        "col-span-1",
        span === 3 && "md:col-span-3 lg:col-span-3",
        span === 4 && "md:col-span-3 lg:col-span-4",
        span === 5 && "md:col-span-3 lg:col-span-5",
        span === 6 && "md:col-span-6 lg:col-span-6",
        span === 8 && "md:col-span-6 lg:col-span-8",
        span === 12 && "md:col-span-6 lg:col-span-12",
        rowSpan === 2 && "row-span-2",
        variantClasses[variant],
        "hover:border-carbon-blue dark:hover:border-carbon-blue hover:shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}
