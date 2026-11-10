import clsx from "clsx";
import type { ReactNode } from "react";

export function Panel({
  className,
  children,
  as: Tag = "section",
  padded = true,
  ...rest
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "aside" | "article";
  padded?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={clsx("se-panel", padded && "p-5", className)} {...rest}>{children}</Tag>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-primary">
            {icon}
          </span>
        )}
        <div className="space-y-1">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="max-w-xl text-[12.5px] leading-relaxed text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  visual,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  /** Optional contextual 3D/rendered visual shown beside the title. */
  visual?: ReactNode;
}) {
  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          {eyebrow && (
            <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-primary/90">{eyebrow}</p>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {description && (
            <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {visual && <div className="hidden shrink-0 sm:block">{visual}</div>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      {children}
    </header>
  );
}
