import { ReactNode } from "react";
import { InlineNotification } from "./InlineNotification";

interface CalloutProps {
  type?: "info" | "success" | "warning" | "tip";
  title?: string;
  children: ReactNode;
}

export function Callout({ type = "info", title, children }: CalloutProps) {
  const kindMap: Record<string, "info" | "success" | "warning" | "error"> = {
    info: "info",
    success: "success",
    warning: "warning",
    tip: "info",
  };

  return (
    <InlineNotification
      kind={kindMap[type] || "info"}
      title={title}
      subtitle={children}
      className="my-6"
    />
  );
}
