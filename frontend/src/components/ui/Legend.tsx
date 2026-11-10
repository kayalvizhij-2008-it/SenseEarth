import clsx from "clsx";
import { CHANGE_CLASSES } from "@/lib/classes";
import { formatPercent } from "@/lib/format";

export function ClassLegend({
  className,
  values,
  showValues = false,
  includeUnchanged = true,
  size = "md",
}: {
  className?: string;
  /** Class pixel counts keyed by class id, e.g. from `statistics.classes`. */
  values?: Map<number, number> | Record<number, number>;
  showValues?: boolean;
  includeUnchanged?: boolean;
  size?: "sm" | "md";
}) {
  const entries = includeUnchanged ? CHANGE_CLASSES : CHANGE_CLASSES.filter((entry) => entry.id !== 0);
  const total = values
    ? Object.values(values instanceof Map ? Object.fromEntries(values) : values).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <ul className={clsx("grid gap-x-4 gap-y-2", className)}>
      {entries.map((entry) => {
        const count = values
          ? values instanceof Map
            ? (values.get(entry.id) ?? 0)
            : (values[entry.id] ?? 0)
          : undefined;
        return (
          <li key={entry.id} className="flex items-center gap-2.5" title={entry.description}>
            <span
              className={clsx(
                "shrink-0 rounded-[3px] border border-white/25",
                size === "sm" ? "size-2.5" : "size-3",
              )}
              style={{ backgroundColor: entry.hex }}
            />
            <span className={clsx("text-ink-soft", size === "sm" ? "text-[11.5px]" : "text-[12.5px]")}>
              {entry.label}
            </span>
            {showValues && count !== undefined && (
              <span className="ml-auto font-mono text-[11px] text-muted">
                {total > 0 ? formatPercent(count / total, 2) : "—"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Swatch({ hex, className }: { hex: string; className?: string }) {
  return (
    <span
      className={clsx("inline-block size-3 rounded-[3px] border border-white/25", className)}
      style={{ backgroundColor: hex }}
    />
  );
}
