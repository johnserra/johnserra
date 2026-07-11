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
      primary: "bg-transparent border-hair text-muted hover:text-accent hover:border-line-strong",
      secondary: "bg-transparent border-hair text-muted hover:text-accent hover:border-line-strong",
      ghost: "bg-transparent border-hair text-muted hover:text-accent hover:border-line-strong",
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
          "inline-flex items-center justify-center rounded-field transition-colors duration-150 cursor-pointer border",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent",
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
