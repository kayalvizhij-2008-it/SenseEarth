import clsx from "clsx";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";

const fieldBase =
  "w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[13.5px] text-ink placeholder:text-muted/70 transition-colors focus:border-primary/60 focus:bg-surface focus:outline-none disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(fieldBase, "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(fieldBase, "py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(fieldBase, "h-10 appearance-none pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, htmlFor, action, children, className }: FieldProps) {
  return (
    <div className={clsx("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          {label}
          {required && <span className="ml-1 text-primary">*</span>}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-[11.5px] leading-snug text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[11.5px] leading-snug text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

interface LabeledInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function LabeledInput({ label, hint, error, className, ...rest }: LabeledInputProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={rest.required} className={className}>
      <Input id={id} {...rest} aria-invalid={Boolean(error)} />
    </Field>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={clsx("relative", className)}>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.2-3.2" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={clsx(fieldBase, "h-10 pl-9", className)}
        aria-label={placeholder ?? "Search"}
      />
    </div>
  );
}
