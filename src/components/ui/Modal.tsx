import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn.js";
import { IconButton } from "./Button.js";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Wide enough for multi-column content (provider manager). */
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
} as const;

/**
 * Accessible modal: focus moves in on open, is trapped while open, Escape
 * closes, and focus returns to the trigger on close. Body scroll is locked.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const focusFirst = () => {
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(
        "input:not([type=hidden]), textarea, select, button, [href], [tabindex]:not([tabindex='-1'])",
      );
      (target ?? panel).focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-ink-strong/25 backdrop-blur-[2px] dark:bg-black/55"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? "modal-description" : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 mt-[6vh] w-full rounded-xl border border-line-subtle bg-surface-overlay",
          "shadow-2xl shadow-ink-strong/10",
          "focus:outline-none",
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 id="modal-title" className="text-[15px] font-semibold text-ink-strong">
              {title}
            </h2>
            {description ? (
              <p id="modal-description" className="text-[13px] text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close" tip="Close" size="icon-sm" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
        </div>

        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* ConfirmDialog                                                        */
/* ------------------------------------------------------------------ */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-md border border-line-strong bg-surface-raised px-3.5 text-sm font-medium text-ink-strong transition-colors hover:bg-surface-sunken disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "h-9 rounded-md px-3.5 text-sm font-medium text-white transition-colors disabled:opacity-50",
              destructive
                ? "bg-state-danger-solid hover:brightness-110"
                : "bg-brand-600 hover:bg-brand-700",
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-ink-muted">{message}</div>
    </Modal>
  );
}
