import { ButtonHTMLAttributes, forwardRef, ReactElement } from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactElement;
  kind?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  description?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, kind = "ghost", size = "md", description, className, ...props }, ref) => {
    const variantClasses = {
      primary: "bg-carbon-blue text-white hover:bg-carbon-blue-hover",
      secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 dark:bg-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-600",
      ghost: "bg-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-carbon-gray-10 dark:hover:bg-carbon-gray-90",
    };

    const sizeClasses = {
      sm: "h-8 w-8 p-1.5",
      md: "h-10 w-10 p-2.5",
      lg: "h-12 w-12 p-3.5",
    };

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "inline-flex items-center justify-center rounded-[var(--radius-bento)] transition-colors duration-150 cursor-pointer border border-transparent",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-carbon-blue focus-visible:border-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[kind],
          sizeClasses[size],
          className
        )}
        aria-label={description}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
