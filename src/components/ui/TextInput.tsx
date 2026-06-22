import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  invalid?: boolean;
  invalidText?: string;
  labelTextClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      label,
      helperText,
      invalid,
      invalidText,
      className,
      disabled,
      labelTextClassName,
      id,
      ...props
    },
    ref
  ) => {
    return (
      <div className="flex flex-col w-full text-left gap-1.5 font-sans">
        {label && (
          <label
            htmlFor={id}
            className={cn(
              "text-xs font-semibold text-zinc-700 dark:text-zinc-300 select-none",
              disabled && "text-zinc-400 dark:text-zinc-600",
              labelTextClassName
            )}
          >
            {label}
          </label>
        )}
        
        {helperText && !invalid && (
          <span className="text-xs text-zinc-500 dark:text-zinc-500 mb-0.5">
            {helperText}
          </span>
        )}

        <div className="relative w-full">
          <input
            ref={ref}
            id={id}
            disabled={disabled}
            className={cn(
              "w-full h-10 px-4 py-2 text-sm text-zinc-900 dark:text-zinc-50 font-sans",
              "bg-carbon-gray-10 dark:bg-carbon-gray-90/50",
              "border-b border-b-zinc-300 dark:border-b-zinc-700 border-x-transparent border-t-transparent",
              "rounded-[var(--radius-bento)] transition-all duration-150 ease-in-out",
              "placeholder-zinc-400 dark:placeholder-zinc-600",
              "focus:outline-none focus:ring-2 focus:ring-carbon-blue focus:border-transparent",
              disabled && "bg-zinc-100 dark:bg-zinc-900/30 text-zinc-400 dark:text-zinc-600 border-b-zinc-200 dark:border-b-zinc-800 cursor-not-allowed",
              invalid && "border-b-red-600 dark:border-b-red-500 focus:ring-red-600 dark:focus:ring-red-500",
              className
            )}
            {...props}
          />
        </div>

        {invalid && invalidText && (
          <span className="text-xs text-red-600 dark:text-red-400 font-medium">
            {invalidText}
          </span>
        )}
      </div>
    );
  }
);

TextInput.displayName = "TextInput";
