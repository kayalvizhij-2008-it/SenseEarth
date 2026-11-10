import clsx from "clsx";
import type { ReactNode } from "react";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  size = "md",
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={clsx(
        "inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2/60 p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-lg font-medium transition-all duration-200",
              size === "sm" ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-[12.5px]",
              active
                ? "bg-surface text-ink shadow-[0_2px_10px_-4px_rgba(0,0,0,0.6)] ring-1 ring-line"
                : "text-muted hover:text-ink-soft",
            )}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={clsx(
                  "rounded-full px-1.5 py-px font-mono text-[10px]",
                  active ? "bg-primary/12 text-primary" : "bg-surface-2 text-muted",
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ value: T; label: ReactNode; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx("inline-flex rounded-lg border border-line bg-surface-2/60 p-0.5", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          aria-pressed={item.value === value}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
            item.value === value ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:text-ink-soft",
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
