import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

const FIELD_BASE = cn(
  "w-full rounded-md border bg-surface-raised text-ink-strong placeholder:text-ink-faint",
  "border-line-subtle transition-colors",
  "hover:border-line-strong",
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint",
  "aria-[invalid=true]:border-state-danger aria-[invalid=true]:ring-state-danger/20",
);

/* ------------------------------------------------------------------ */
/* Input                                                                */
/* ------------------------------------------------------------------ */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  /** Rendered inside the field on the right. */
  trailing?: ReactNode;
  /** Rendered at the left inside the field. */
  leading?: ReactNode;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, trailing, leading, mono = false, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy: string[] = [];
  if (hint) describedBy.push(`${inputId}-hint`);
  if (error) describedBy.push(`${inputId}-error`);

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-[13px] font-medium text-ink-strong">
          {label}
        </label>
      ) : null}

      <div className="relative flex items-center">
        {leading ? (
          <span className="pointer-events-none absolute left-3 flex items-center text-ink-faint">
            {leading}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy.length ? describedBy.join(" ") : undefined}
          className={cn(
            FIELD_BASE,
            "h-9 px-3 text-sm",
            leading && "pl-9",
            trailing && "pr-10",
            mono && "font-mono text-[13px]",
            className,
          )}
          {...rest}
        />
        {trailing ? (
          <span className="absolute right-1.5 flex items-center">{trailing}</span>
        ) : null}
      </div>

      {error ? (
        <p id={`${inputId}-error`} className="text-[12px] text-state-danger-strong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[12px] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Textarea                                                            */
/* ------------------------------------------------------------------ */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy: string[] = [];
  if (hint) describedBy.push(`${fieldId}-hint`);
  if (error) describedBy.push(`${fieldId}-error`);

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={fieldId} className="text-[13px] font-medium text-ink-strong">
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy.length ? describedBy.join(" ") : undefined}
        className={cn(FIELD_BASE, "min-h-[72px] px-3 py-2 text-sm leading-relaxed", className)}
        {...rest}
      />
      {error ? (
        <p id={`${fieldId}-error`} className="text-[12px] text-state-danger-strong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-[12px] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Select                                                               */
/* ------------------------------------------------------------------ */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy: string[] = [];
  if (hint) describedBy.push(`${fieldId}-hint`);
  if (error) describedBy.push(`${fieldId}-error`);

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={fieldId} className="text-[13px] font-medium text-ink-strong">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy.length ? describedBy.join(" ") : undefined}
          className={cn(
            FIELD_BASE,
            "h-9 appearance-none pl-3 pr-8 text-sm",
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
        >
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path
              d="M1 1L5 5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="text-[12px] text-state-danger-strong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-[12px] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Switch                                                               */
/* ------------------------------------------------------------------ */

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: ReactNode;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, hint, disabled, id }: SwitchProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={fieldId} className="text-[13px] font-medium text-ink-strong">
          {label}
        </label>
        {hint ? <div className="text-[12px] text-ink-muted">{hint}</div> : null}
      </div>
      <button
        type="button"
        id={fieldId}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
          checked
            ? "border-brand-600 bg-brand-600"
            : "border-line-strong bg-surface-sunken",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                             */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded bg-surface-sunken", className)}
    />
  );
}
