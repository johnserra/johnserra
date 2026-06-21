import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary:
      "bg-carbon-blue text-white hover:bg-carbon-blue-hover border border-transparent",
    secondary:
      "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 dark:bg-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-600 border border-transparent",
    ghost:
      "bg-transparent text-zinc-900 dark:text-zinc-50 hover:bg-carbon-gray-10 dark:hover:bg-carbon-gray-90 border border-transparent",
  };

  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-5 py-2.5 text-sm", // Carbon button sizing is relatively high-density
    lg: "px-7 py-3 text-base",
  };

  return (
    <button
      className={cn(
        "rounded-[var(--radius-bento)] font-medium transition-all duration-150 ease-in-out cursor-pointer inline-flex items-center justify-center",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
