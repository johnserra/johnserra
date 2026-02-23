import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ProseLayoutProps {
  children: ReactNode;
  className?: string;
}

export function ProseLayout({ children, className }: ProseLayoutProps) {
  return (
    <article
      className={cn(
        "prose prose-zinc dark:prose-invert max-w-none",
        // Headings
        "prose-h1:text-4xl prose-h1:font-bold prose-h1:tracking-tight",
        "prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-10 prose-h2:mb-4",
        "prose-h3:text-xl prose-h3:font-semibold",
        // Body
        "prose-p:leading-relaxed prose-p:text-zinc-600 dark:prose-p:text-zinc-400",
        // Links
        "prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline",
        // Lists
        "prose-li:text-zinc-600 dark:prose-li:text-zinc-400",
        // Strong
        "prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100 prose-strong:font-semibold",
        // HR
        "prose-hr:border-zinc-200 dark:prose-hr:border-zinc-800",
        className
      )}
    >
      {children}
    </article>
  );
}
