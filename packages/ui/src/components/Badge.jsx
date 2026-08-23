
import { roleBadgeColor } from "../tokens";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  role?;
}

const colorVarMap = {
  brick: "var(--color-brick)",
  gold: "var(--color-gold)",
  slate: "var(--color-slate)",
  forest: "var(--color-forest)",
};

export function Badge({ role, className = "", children, ...props }: BadgeProps) {
  const tone = role ? roleBadgeColor[role] : "slate";
  const color = colorVarMap[tone] ?? colorVarMap.slate;

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      ].join(" ")}
      style={{ backgroundColor: `${color}1A`, color }}
      {...props}
    >
      {children ?? role}
    </span>
  );
}
