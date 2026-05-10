import { ReactNode } from "react";
import { Info, CheckCircle, AlertTriangle, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalloutProps {
  type?: "info" | "success" | "warning" | "tip";
  title?: string;
  children: ReactNode;
}

const types = {
  info: {
    icon: Info,
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-900",
    text: "text-blue-900 dark:text-blue-100",
    iconColor: "text-blue-500",
  },
  success: {
    icon: CheckCircle,
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-900",
    text: "text-emerald-900 dark:text-emerald-100",
    iconColor: "text-emerald-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-900",
    text: "text-amber-900 dark:text-amber-100",
    iconColor: "text-amber-500",
  },
  tip: {
    icon: Lightbulb,
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    border: "border-indigo-200 dark:border-indigo-900",
    text: "text-indigo-900 dark:text-indigo-100",
    iconColor: "text-indigo-500",
  },
};

export function Callout({ type = "info", title, children }: CalloutProps) {
  const config = types[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "my-8 flex gap-4 rounded-xl border p-6 shadow-sm",
        config.bg,
        config.border,
        config.text
      )}
    >
      <div className={cn("mt-1 shrink-0", config.iconColor)}>
        <Icon size={24} />
      </div>
      <div className="flex-1">
        {title && (
          <p className="mb-2 font-bold leading-none tracking-tight">
            {title}
          </p>
        )}
        <div className="prose-p:m-0 prose-p:leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}
