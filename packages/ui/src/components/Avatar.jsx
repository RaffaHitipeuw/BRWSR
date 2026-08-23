

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = 36, className = "", ...props }: AvatarProps) {
  return (
    <div
      className={[
        "flex items-center justify-center rounded-full bg-[var(--color-ink)] text-[var(--color-paper)] font-medium select-none",
        className,
      ].join(" ")}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={name}
      {...props}
    >
      {initials(name)}
    </div>
  );
}
