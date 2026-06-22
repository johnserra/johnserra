import { ReactNode } from "react";
import {
  Information,
  CheckmarkFilled,
  WarningAlt,
  ErrorFilled,
  Close,
} from "@carbon/icons-react";
import { cn } from "@/lib/utils";

interface InlineNotificationProps {
  kind?: "info" | "success" | "warning" | "error";
  title?: string;
  subtitle?: ReactNode;
  onClose?: () => void;
  className?: string;
}

const kinds = {
  info: {
    icon: Information,
    bg: "bg-blue-50/50 dark:bg-blue-950/20",
    border: "border-blue-200/80 dark:border-blue-900/30 border-l-blue-600 dark:border-l-blue-500",
    text: "text-zinc-900 dark:text-zinc-50",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  success: {
    icon: CheckmarkFilled,
    bg: "bg-emerald-50/50 dark:bg-emerald-950/20",
    border: "border-emerald-200/80 dark:border-emerald-900/30 border-l-emerald-600 dark:border-l-emerald-500",
    text: "text-zinc-900 dark:text-zinc-50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    icon: WarningAlt,
    bg: "bg-amber-50/50 dark:bg-amber-950/20",
    border: "border-amber-200/80 dark:border-amber-900/30 border-l-amber-600 dark:border-l-amber-500",
    text: "text-zinc-900 dark:text-zinc-50",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  error: {
    icon: ErrorFilled,
    bg: "bg-red-50/50 dark:bg-red-950/20",
    border: "border-red-200/80 dark:border-red-900/30 border-l-red-600 dark:border-l-red-500",
    text: "text-zinc-900 dark:text-zinc-50",
    iconColor: "text-red-600 dark:text-red-400",
  },
};

export function InlineNotification({
  kind = "info",
  title,
  subtitle,
  onClose,
  className,
}: InlineNotificationProps) {
  const config = kinds[kind];
  const Icon = config.icon;

  return (
    <div
      role="alert"
      className={cn(
        "my-4 flex items-start gap-3 rounded-[var(--radius-bento)] border border-l-[4px] p-4 text-sm font-sans",
        config.bg,
        config.border,
        config.text,
        className
      )}
    >
      <div className={cn("mt-0.5 shrink-0", config.iconColor)}>
        <Icon size={20} />
      </div>
      
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-bold leading-tight mb-1 select-none">
            {title}
          </p>
        )}
        {subtitle && (
          <div className="text-zinc-600 dark:text-zinc-400 leading-relaxed break-words">
            {subtitle}
          </div>
        )}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-zinc-400 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors p-0.5 rounded focus-visible:ring-1 focus-visible:ring-carbon-blue"
          aria-label="Close notification"
        >
          <Close size={16} />
        </button>
      )}
    </div>
  );
}
