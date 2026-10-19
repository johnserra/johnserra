import { ReactNode } from "react";

interface BentoGridProps {
  children: ReactNode;
}

export function BentoGrid({ children }: BentoGridProps) {
  return (
    <div
      className="
        grid
        grid-cols-1
        md:grid-cols-6
        lg:grid-cols-12
        gap-6
        w-full
        max-w-6xl
        mx-auto
        px-4
        md:px-6
        auto-rows-auto
      "
    >
      {children}
    </div>
  );
}
