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
    default: "bg-panel border border-hair",
    gradient: "bg-ground-3 border border-hair",
    glass: "bg-panel/60 backdrop-blur-xl border border-hair",
  };

  return (
    <div
      className={cn(
        "rounded-card p-6 transition-colors duration-200",
        "col-span-1",
        span === 3 && "md:col-span-3 lg:col-span-3",
        span === 4 && "md:col-span-3 lg:col-span-4",
        span === 5 && "md:col-span-3 lg:col-span-5",
        span === 6 && "md:col-span-6 lg:col-span-6",
        span === 8 && "md:col-span-6 lg:col-span-8",
        span === 12 && "md:col-span-6 lg:col-span-12",
        rowSpan === 2 && "row-span-2",
        variantClasses[variant],
        "hover:border-line-strong",
        className
      )}
    >
      {children}
    </div>
  );
}
