import clsx from "clsx";
import type { ReactNode } from "react";
import { Skeleton } from "./Feedback";

export function Stat({
  label,
  value,
  unit,
  hint,
  icon,
  tone = "default",
  loading,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  loading?: boolean;
  className?: string;
}) {
  const toneClass = {
    default: "text-ink",
    primary: "text-primary",
    success: "text-accent",
    warning: "text-warn",
    danger: "text-danger",
  }[tone];

  return (
    <div className={clsx("se-panel-flex group relative overflow-hidden rounded-2xl border border-line bg-surface p-4", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
        {icon && <span className="text-muted transition-colors group-hover:text-primary">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <p className={clsx("mt-2 font-mono text-[22px] font-medium leading-none tracking-tight", toneClass)}>
          {value}
          {unit && <span className="ml-1 text-[12px] font-normal text-muted">{unit}</span>}
        </p>
      )}
      {hint && <p className="mt-2 text-[11.5px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}
