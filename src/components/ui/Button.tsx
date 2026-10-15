import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/cn.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50 focus-visible:ring-brand-500",
  secondary:
    "border border-line-strong bg-surface-raised text-ink-strong hover:bg-surface-sunken focus-visible:ring-brand-500",
  ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink-strong focus-visible:ring-brand-500",
  danger:
    "border border-state-danger/30 bg-state-danger-bg text-state-danger-strong hover:bg-state-danger/15 focus-visible:ring-state-danger",
  subtle: "bg-surface-sunken text-ink-muted hover:bg-line-subtle focus-visible:ring-brand-500",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-lg",
  icon: "h-9 w-9 rounded-md",
  "icon-sm": "h-7 w-7 rounded-md",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-medium",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/* IconButton                                                           */
/* ------------------------------------------------------------------ */

export interface IconButtonProps extends ButtonProps {
  /** Required: icon-only controls need an accessible name. */
  label: string;
  /** Rendered below the control on hover. */
  tip?: string;
  /** Show the shortcut hint next to the tooltip. */
  shortcut?: string;
  tooltipSide?: "top" | "bottom" | "left" | "right";
}

export function IconButton({
  label,
  tip,
  shortcut,
  tooltipSide = "bottom",
  size = "icon",
  className,
  ...rest
}: IconButtonProps) {
  const described = tip ?? label;
  return (
    <div className={cn("group/icon relative inline-flex", className)}>
      <Button
        aria-label={label}
        aria-description={described}
        size={size}
        className="relative"
        {...rest}
      />
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-md",
          "border border-line-subtle bg-surface-overlay px-2 py-1 text-[11px] font-medium text-ink-strong",
          "shadow-lg shadow-surface-sunken/50",
          "group-hover/icon:block",
          tooltipSide === "bottom" && "left-1/2 top-full mt-1.5 -translate-x-1/2",
          tooltipSide === "top" && "left-1/2 bottom-full mb-1.5 -translate-x-1/2",
          tooltipSide === "left" && "right-full top-1/2 mr-1.5 -translate-y-1/2",
          tooltipSide === "right" && "left-full top-1/2 ml-1.5 -translate-y-1/2",
        )}
      >
        {described}
        {shortcut ? <kbd className="ml-1.5 text-ink-faint">{shortcut}</kbd> : null}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                                */
/* ------------------------------------------------------------------ */

export type BadgeTone = "neutral" | "brand" | "positive" | "warning" | "danger" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-ink-muted border-line-subtle",
  brand: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950 dark:text-brand-200 dark:border-brand-800",
  positive:
    "bg-state-positive-bg text-state-positive-strong border-state-positive/30",
  warning: "bg-state-warning-bg text-state-warning-strong border-state-warning/30",
  danger: "bg-state-danger-bg text-state-danger-strong border-state-danger/30",
  info: "bg-state-info-bg text-state-info-strong border-state-info/30",
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({ tone = "neutral", children, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Marks a value that was computed locally rather than reported by the provider. */
export function EstimatedTag({ className }: { className?: string }) {
  return (
    <span
      title="This value was estimated locally, not reported by the provider."
      className={cn(
        "inline-flex items-center rounded border border-dashed border-line-strong",
        "bg-surface-sunken/60 px-1 py-px text-[10px] font-medium leading-4 text-ink-faint",
        className,
      )}
    >
      est.
    </span>
  );
}

/** Marks a value the provider did not report. */
export function UnknownTag({ className }: { className?: string }) {
  return (
    <span
      title="The provider did not report this, so it is unknown — not zero."
      className={cn(
        "inline-flex items-center rounded border border-line-subtle px-1 py-px",
        "text-[10px] font-medium leading-4 text-ink-faint",
        className,
      )}
    >
      unknown
    </span>
  );
}
