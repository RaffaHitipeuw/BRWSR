import { InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = "", ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-ink)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            "rounded-md border px-3 py-2 text-sm bg-white",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]",
            error ? "border-[var(--color-brick)]" : "border-[var(--color-ink)]/15",
            className,
          ].join(" ")}
          aria-invalid={!!error}
          {...props}
        />
        {error && <span className="text-xs text-[var(--color-brick)]">{error}</span>}
      </div>
    );
  },
);

Input.displayName = "Input";
