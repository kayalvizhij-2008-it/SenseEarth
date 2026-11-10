import clsx from "clsx";
import type { ReactNode } from "react";
import type { AnalysisStatus } from "@/api/types";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "violet";

const tones: Record<Tone, string> = {
  neutral: "border-line-strong/70 bg-surface-2 text-ink-soft",
  primary: "border-primary/35 bg-primary/10 text-primary",
  success: "border-accent/35 bg-accent/10 text-accent",
  warning: "border-warn/35 bg-warn/10 text-warn",
  danger: "border-danger/35 bg-danger/10 text-danger",
  violet: "border-violet/35 bg-violet/10 text-violet",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
  mono,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
  mono?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.1em]",
        tones[tone],
        mono && "font-mono tracking-[0.08em]",
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const statusTone: Record<AnalysisStatus, Tone> = {
  queued: "neutral",
  processing: "primary",
  completed: "success",
  failed: "danger",
};

export function StatusBadge({ status, className }: { status: AnalysisStatus; className?: string }) {
  return (
    <Badge
      tone={statusTone[status] ?? "neutral"}
      dot
      className={clsx(status === "processing" && "[&>span:first-child]:se-live-dot", className)}
    >
      {status === "processing" ? "Running" : status}
    </Badge>
  );
}
