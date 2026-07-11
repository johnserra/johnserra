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
        "prose prose-invert max-w-[70ch]",
        "prose-headings:text-ink prose-headings:tracking-tight",
        "prose-p:text-ink-soft prose-p:leading-relaxed",
        "prose-a:text-accent prose-a:no-underline hover:prose-a:underline",
        "prose-strong:text-ink",
        "prose-code:font-mono prose-code:text-accent",
        "prose-blockquote:border-l-accent-dim prose-blockquote:text-ink-soft",
        "prose-hr:border-hair",
        "prose-li:text-ink-soft",
        className
      )}
    >
      {children}
    </article>
  );
}
