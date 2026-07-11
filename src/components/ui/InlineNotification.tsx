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
    bg: "bg-panel",
    border: "border-hair border-l-accent",
    titleColor: "text-accent",
  },
  success: {
    icon: CheckmarkFilled,
    bg: "bg-good/10",
    border: "border-hair border-l-good",
    titleColor: "text-good",
  },
  warning: {
    icon: WarningAlt,
    bg: "bg-warn/10",
    border: "border-hair border-l-warn",
    titleColor: "text-warn",
  },
  error: {
    icon: ErrorFilled,
    bg: "bg-bad/10",
    border: "border-hair border-l-bad",
    titleColor: "text-bad",
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
        "my-4 flex items-start gap-3 rounded-card border border-l-2 p-4 text-sm font-sans",
        config.bg,
        config.border,
        className
      )}
    >
      <div className={cn("mt-0.5 shrink-0", config.titleColor)}>
        <Icon size={20} />
      </div>
      
      <div className="flex-1 min-w-0">
        {title && (
          <p className={cn("font-bold leading-tight mb-1 select-none", config.titleColor)}>
            {title}
          </p>
        )}
        {subtitle && (
          <div className="text-ink-soft leading-relaxed break-words">
            {subtitle}
          </div>
        )}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-muted hover:text-ink transition-colors p-0.5 rounded-field focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Close notification"
        >
          <Close size={16} />
        </button>
      )}
    </div>
  );
}
