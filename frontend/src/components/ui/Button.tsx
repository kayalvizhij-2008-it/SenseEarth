import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-ink hover:brightness-110 shadow-[0_10px_30px_-12px_var(--se-glow)] font-semibold",
  secondary:
    "bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-elevated",
  ghost: "text-ink-soft hover:text-ink hover:bg-surface-2",
  outline: "border border-line-strong text-ink hover:bg-surface-2 hover:border-primary/50",
  danger: "bg-danger/12 text-danger border border-danger/35 hover:bg-danger/20",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-[13.5px] gap-2 rounded-xl",
  lg: "h-12 px-6 text-[14.5px] gap-2.5 rounded-xl",
};

const base =
  "inline-flex items-center justify-center font-medium transition-all duration-200 select-none disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  to?: string;
  full?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  iconRight,
  to,
  full,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = clsx(base, variants[variant], sizes[size], full && "w-full", className);
  const content = (
    <>
      {loading ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
      {iconRight}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes} aria-disabled={disabled}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface-2/60 text-muted transition-colors hover:text-ink hover:border-line-strong",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
