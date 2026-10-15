import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export interface AppShellProps {
  state: import("../../state/appState.js").AppState;
  dispatch: import("../../state/appState.js").Dispatch;
  user: import("../../../shared/types.js").UserProfile | null;
  sidebar: ReactNode;
  children: ReactNode;
}

type Dispatch = import("../../state/appState.js").Dispatch;

/**
 * The persistent application frame: a collapsible left sidebar and the
 * workspace area beside it. Never scrolls the frame itself — only inner
 * regions scroll — so the composer stays reachable on any viewport.
 */
export function AppShell({ state, dispatch, user, sidebar, children }: AppShellProps) {
  const collapsed = !state.sidebarOpen;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-ink-strong antialiased">
      {/* Sidebar: a real column on desktop, an overlay sheet on mobile. */}
      <div
        className={cn(
          "shrink-0 overflow-hidden border-r border-line-subtle bg-surface-sunken",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-0 md:w-0" : "w-0 md:w-[var(--sidebar-w)]",
          "fixed inset-y-0 left-0 z-40 md:relative md:z-auto",
          collapsed ? "pointer-events-none" : "w-[var(--sidebar-w)] shadow-xl md:shadow-none",
        )}
        style={{ "--sidebar-w": `${state.sidebarWidth}px` } as React.CSSProperties}
        aria-hidden={collapsed ? "true" : undefined}
        inert={collapsed ? true : undefined}
      >
        {sidebar}
      </div>

      {/* Scrim for the mobile overlay sidebar. */}
      {!collapsed ? (
        <button
          type="button"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => dispatch({ type: "sidebar/toggle" })}
          className="fixed inset-0 z-30 bg-ink-strong/20 md:hidden"
        />
      ) : null}

      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar state={state} dispatch={dispatch} user={user} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

function TopBar({
  state,
  dispatch,
  user,
}: {
  state: import("../../state/appState.js").AppState;
  dispatch: Dispatch;
  user: import("../../../shared/types.js").UserProfile | null;
}) {
  const activeConversation =
    state.conversations.find((c) => c.id === state.activeConversationId) ?? null;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface/95 px-3 backdrop-blur">
      <button
        type="button"
        aria-label={state.sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        aria-expanded={state.sidebarOpen}
        onClick={() => dispatch({ type: "sidebar/toggle" })}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <rect x="2.5" y="4" width="15" height="12" rx="2" />
          <path d="M8 4v12" />
        </svg>
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="truncate text-[13px] font-semibold text-ink-strong">
          {activeConversation?.title ?? "New conversation"}
        </h1>
        {activeConversation ? (
          <span className="hidden shrink-0 text-[11px] text-ink-faint sm:inline">
            saved {new Date(activeConversation.updatedAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>

      <ModeSwitch state={state} dispatch={dispatch} />

      {user ? (
        <div className="hidden items-center gap-2 pl-2 sm:flex">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-6 w-6 rounded-full border border-line-subtle"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
              {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="max-w-[140px] truncate text-[12px] text-ink-muted">
            {user.name ?? user.email}
          </span>
        </div>
      ) : null}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Single / Compare switch                                             */
/* ------------------------------------------------------------------ */

function ModeSwitch({
  state,
  dispatch,
}: {
  state: import("../../state/appState.js").AppState;
  dispatch: Dispatch;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Chat mode"
      className="flex items-center gap-0.5 rounded-lg border border-line-subtle bg-surface-sunken p-0.5"
    >
      <ModeButton
        active={state.mode === "single"}
        onClick={() => dispatch({ type: "mode/set", mode: "single" })}
        label="Single"
        hint="Chat with one model"
      />
      <ModeButton
        active={state.mode === "compare"}
        onClick={() => dispatch({ type: "mode/set", mode: "compare" })}
        label="Compare"
        hint="Chat with up to 4 models at once"
        badge="4"
      />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  hint,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={hint}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        active
          ? "bg-surface-raised text-ink-strong shadow-sm"
          : "text-ink-muted hover:text-ink-strong",
      )}
    >
      {label}
      {badge ? (
        <span
          className={cn(
            "rounded px-1 text-[10px] font-semibold",
            active ? "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200" : "bg-line-subtle text-ink-faint",
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}
