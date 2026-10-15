import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn.js";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  /** Optional secondary line. */
  detail?: string;
  durationMs: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  show: (toast: Omit<Toast, "id" | "durationMs"> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 4;

const TONE_STYLES: Record<ToastTone, { wrap: string; icon: ReactNode }> = {
  info: {
    wrap: "border-line-subtle bg-surface-overlay text-ink-strong",
    icon: <InfoIcon />,
  },
  success: {
    wrap: "border-state-positive/35 bg-surface-overlay text-ink-strong",
    icon: <CheckIcon />,
  },
  warning: {
    wrap: "border-state-warning/40 bg-surface-overlay text-ink-strong",
    icon: <WarnIcon />,
  },
  danger: {
    wrap: "border-state-danger/40 bg-surface-overlay text-ink-strong",
    icon: <ErrorIcon />,
  },
};

const TONE_ICON_COLOR: Record<ToastTone, string> = {
  info: "text-state-info-strong",
  success: "text-state-positive-strong",
  warning: "text-state-warning-strong",
  danger: "text-state-danger-strong",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastContextValue["show"]>(
    (toast) => {
      counterRef.current += 1;
      const id = `t${counterRef.current}-${Date.now().toString(36)}`;
      const entry: Toast = {
        id,
        durationMs: 5200,
        ...toast,
      };
      setToasts((current) => [...current, entry].slice(-MAX_VISIBLE));
      if (entry.durationMs > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => {
            setToasts((current) => current.filter((t) => t.id !== id));
            timersRef.current.delete(id);
          }, entry.durationMs),
        );
      }
      return id;
    },
    [],
  );

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue["show"] {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return ctx.show;
}

export function useToastActions() {
  return useContext(ToastContext)!;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const style = TONE_STYLES[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            aria-live={toast.tone === "danger" ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3",
              "shadow-lg shadow-ink-strong/10 backdrop-blur",
              "animate-in slide-in-from-right-2 duration-200",
              style.wrap,
            )}
          >
            <span className={cn("mt-px shrink-0", TONE_ICON_COLOR[toast.tone])} aria-hidden="true">
              {style.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug">{toast.message}</p>
              {toast.detail ? (
                <p className="mt-1 break-words text-[12px] leading-snug text-ink-muted">
                  {toast.detail}
                </p>
              ) : null}
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    onDismiss(toast.id);
                  }}
                  className="mt-2 text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(toast.id)}
              className="-mr-1 -mt-1 shrink-0 rounded p-1 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink-strong"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M2 2l10 10M12 2L2 12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7v4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.85" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.2 8.2l2 2 3.6-4.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.2l5.6 10.1H2.4L8 2.2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 6.2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="10.9" r="0.8" fill="currentColor" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
