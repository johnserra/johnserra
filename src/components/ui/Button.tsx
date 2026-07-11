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
      "bg-accent text-on-accent hover:bg-accent-dim border border-transparent",
    secondary:
      "bg-transparent border border-line text-ink hover:border-line-strong",
    ghost:
      "bg-transparent text-muted hover:text-ink border border-transparent",
  };

  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-5 py-2.5 text-sm", // Carbon button sizing is relatively high-density
    lg: "px-7 py-3 text-base",
  };

  return (
    <button
      className={cn(
        "rounded-pill font-medium transition-colors duration-150 ease-in-out cursor-pointer inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed",
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
