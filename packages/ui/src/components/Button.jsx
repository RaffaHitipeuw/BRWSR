

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses = {
  primary: "bg-[var(--color-ink)] text-[var(--color-paper)] hover:opacity-90",
  secondary:
    "bg-transparent text-[var(--color-ink)] border border-[var(--color-ink)]/20 hover:bg-[var(--color-ink)]/5",
  ghost: "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-ink)]/5",
  danger: "bg-[var(--color-brick)] text-white hover:opacity-90",
};

const sizeClasses = {
  sm: "text-sm px-3 py-1.5 rounded-md",
  md: "text-sm px-4 py-2 rounded-md",
  lg: "text-base px-5 py-2.5 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={[
          "font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
