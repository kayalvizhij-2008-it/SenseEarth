import clsx from "clsx";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx(
        "inline-block size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary",
        className,
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-surface-2", className)} />;
}

export function LoadingBlock({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3 p-1" aria-busy="true" aria-label={label}>
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-2xl border border-line bg-surface-2 text-muted">
        {icon ?? <Inbox className="size-5" />}
      </span>
      <div className="space-y-1">
        <p className="text-[14px] font-medium text-ink">{title}</p>
        {description && <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  action,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={clsx(
        "flex flex-col items-start gap-3 rounded-2xl border border-danger/30 bg-danger/[0.06] p-5",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-danger">
        <AlertTriangle className="size-4" />
        <p className="text-[13.5px] font-semibold">{title}</p>
      </div>
      {message && <p className="text-[12.5px] leading-relaxed text-ink-soft">{message}</p>}
      <div className="flex gap-2">
        {onRetry && (
          <Button size="sm" variant="outline" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
            Try again
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  label,
  sheen,
}: {
  value: number;
  className?: string;
  label?: string;
  sheen?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("space-y-1.5", className)}>
      {label && (
        <div className="flex items-center justify-between text-[11.5px] text-muted">
          <span>{label}</span>
          <span className="font-mono text-ink-soft">{Math.round(clamped)}%</span>
        </div>
      )}
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={clsx(
            "relative h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-500",
            sheen && "se-progress-sheen overflow-hidden",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
