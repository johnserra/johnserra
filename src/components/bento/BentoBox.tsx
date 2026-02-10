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
    default: "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800",
    gradient: "bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950",
    glass: "bg-white/80 dark:bg-black/50 backdrop-blur-xl border border-white/20 dark:border-white/10",
  };

  return (
    <div
      className={cn(
        "rounded-3xl p-6 transition-all duration-300",
        "col-span-1",
        span === 3 && "md:col-span-3 lg:col-span-3",
        span === 4 && "md:col-span-3 lg:col-span-4",
        span === 5 && "md:col-span-3 lg:col-span-5",
        span === 6 && "md:col-span-6 lg:col-span-6",
        span === 8 && "md:col-span-6 lg:col-span-8",
        span === 12 && "md:col-span-6 lg:col-span-12",
        rowSpan === 2 && "row-span-2",
        variantClasses[variant],
        "hover:shadow-xl hover:-translate-y-1",
        className
      )}
    >
      {children}
    </div>
  );
}
