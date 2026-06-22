import { ReactNode, MouseEvent } from "react";
import { Close } from "@carbon/icons-react";
import { cn } from "@/lib/utils";

interface TagProps {
  children: ReactNode;
  type?: "gray" | "blue" | "green" | "red" | "purple" | "cyan" | "magenta";
  onClick?: (e: MouseEvent<HTMLSpanElement | HTMLButtonElement>) => void;
  onClose?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

const tagTypes = {
  gray: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
  blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  green: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  red: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  purple: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  cyan: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300",
  magenta: "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300",
};

export function Tag({
  children,
  type = "gray",
  onClick,
  onClose,
  className,
}: TagProps) {
  const isClickable = !!onClick;
  const isCloseable = !!onClose;

  const baseClasses = cn(
    "inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full font-sans select-none border border-transparent transition-all duration-150",
    tagTypes[type] || tagTypes.gray,
    isClickable && "hover:opacity-85 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-carbon-blue",
    className
  );

  if (isClickable) {
    return (
      <button type="button" onClick={onClick} className={baseClasses}>
        {children}
      </button>
    );
  }

  return (
    <span className={baseClasses}>
      {children}
      {isCloseable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose(e);
          }}
          className="hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full p-0.5 -mr-1 shrink-0 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          aria-label="Remove tag"
        >
          <Close size={12} />
        </button>
      )}
    </span>
  );
}
