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
              "text-xs font-mono text-muted uppercase tracking-[0.1em] select-none",
              disabled && "text-faint",
              labelTextClassName
            )}
          >
            {label}
          </label>
        )}
        
        {helperText && !invalid && (
          <span className="text-xs text-faint mb-0.5">
            {helperText}
          </span>
        )}

        <div className="relative w-full">
          <input
            ref={ref}
            id={id}
            disabled={disabled}
            className={cn(
              "w-full h-10 px-4 py-2 text-sm text-ink font-sans",
              "bg-ground-2 border border-hair rounded-field transition-colors duration-150 ease-in-out",
              "placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
              disabled && "opacity-50 cursor-not-allowed",
              invalid && "border-bad text-bad focus:border-bad focus:ring-bad",
              className
            )}
            {...props}
          />
        </div>

        {invalid && invalidText && (
          <span className="text-xs text-bad">
            {invalidText}
          </span>
        )}
      </div>
    );
  }
);

TextInput.displayName = "TextInput";
