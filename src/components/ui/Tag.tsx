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
  gray: "bg-transparent text-muted border-hair",
  blue: "bg-transparent text-muted border-hair",
  green: "bg-transparent text-muted border-hair",
  red: "bg-transparent text-muted border-hair",
  purple: "bg-transparent text-muted border-hair",
  cyan: "bg-transparent text-muted border-hair",
  magenta: "bg-transparent text-muted border-hair",
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
    "inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs rounded-pill font-mono uppercase tracking-[0.08em] select-none border transition-colors duration-150",
    tagTypes[type] || tagTypes.gray,
    isClickable && "hover:text-ink hover:border-line-strong cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
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
          className="rounded-pill p-0.5 -mr-1 shrink-0 text-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Remove tag"
        >
          <Close size={12} />
        </button>
      )}
    </span>
  );
}
