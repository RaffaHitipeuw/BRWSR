import { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "bg-[var(--color-paper)] border border-[var(--color-ink)]/10 rounded-lg shadow-sm",
        "p-5",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={["text-lg font-semibold mb-2 text-[var(--color-ink)]", className].join(" ")}
      {...props}
    >
      {children}
    </h3>
  );
}
