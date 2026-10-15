import { useMemo, useState } from "react";
import type {
  ModelWithProvider,
  ProviderConfig,
  UserProfile,
} from "../../../shared/types.js";
import type { Action, AppState } from "../../state/appState.js";
import { setFavourite, setPinned } from "../../lib/api.js";
import {
  PlusIcon,
  SearchIcon,
  ChatIcon,
  CompareIcon,
  LibraryIcon,
  KeyIcon,
  SettingsIcon,
  StarIcon,
  PinIcon,
  TrashIcon,
  FolderIcon,
  ChevronIcon,
  SunIcon,
  MoonIcon,
  UserIcon,
} from "../ui/Icons.js";
import { cn } from "../../lib/cn.js";
import { dayBucket, formatRelativeTime, groupBy, truncate } from "../../lib/format.js";

export interface SidebarProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onOpenConversation: (id: string) => void | Promise<void>;
  onNewConversation: () => Promise<unknown>;
  onDeleteConversation: (id: string) => Promise<void>;
  onLogout: () => void | Promise<void>;
  onRefreshModels: () => Promise<unknown>;
  onRefreshConversations: () => Promise<unknown>;
}

type View = "history" | "models" | "providers" | "settings";

export function Sidebar(props: SidebarProps) {
  const { state, dispatch, onNewConversation, onLogout } = props;
  const [view, setView] = useState<View>("history");
  const [query, setQuery] = useState("");

  const favourites = useMemo(
    () =>
      state.models
        .filter((m) => m.favourite)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [state.models],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return state.conversations;
    const needle = query.trim().toLowerCase();
    return state.conversations.filter((c) => c.title.toLowerCase().includes(needle));
  }, [state.conversations, query]);

  const groups = useMemo(
    () => groupBy(filtered, (c) => dayBucket(c.updatedAt)),
    [filtered],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brand */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line-subtle px-3.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-white">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 2l1.7 4.6L16.3 8.3l-4.6 1.7L10 14.6 8.3 10 3.7 8.3l4.6-1.7L10 2z" />
          </svg>
        </span>
        <span className="text-[13px] font-semibold tracking-tight text-ink-strong">ROSA</span>
        <span className="ml-auto rounded-full border border-line-subtle px-1.5 py-px text-[10px] font-medium text-ink-faint">
          BYOK
        </span>
      </div>

      {/* New chat */}
      <div className="shrink-0 p-2.5">
        <button
          type="button"
          onClick={() => void onNewConversation()}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[13px] font-medium",
            "bg-brand-600 text-white transition-colors hover:bg-brand-700",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
          )}
        >
          <PlusIcon size={15} />
          New chat
        </button>
      </div>

      {/* View switch */}
      <nav aria-label="Sections" className="shrink-0 px-2.5 pb-2">
        <div className="flex flex-col gap-0.5">
          <NavItem
            active={view === "history"}
            onClick={() => setView("history")}
            icon={<ChatIcon size={15} />}
            label="Conversations"
            count={state.conversations.length}
          />
          <NavItem
            active={view === "models"}
            onClick={() => setView("models")}
            icon={<LibraryIcon size={15} />}
            label="Model library"
            count={state.models.length}
          />
          <NavItem
            active={view === "providers"}
            onClick={() => setView("providers")}
            icon={<KeyIcon size={15} />}
            label="Providers"
            count={state.providers.length}
          />
          <NavItem
            active={view === "settings"}
            onClick={() => setView("settings")}
            icon={<SettingsIcon size={15} />}
            label="Settings"
          />
        </div>
      </nav>

      <div className="mx-2.5 h-px shrink-0 bg-line-subtle" />

      {/* Panel body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {view === "history" ? (
          <HistoryPanel
            state={state}
            dispatch={dispatch}
            query={query}
            onQueryChange={setQuery}
            groups={groups}
            onOpenConversation={props.onOpenConversation}
            onDeleteConversation={props.onDeleteConversation}
            onRefreshConversations={props.onRefreshConversations}
          />
        ) : view === "models" ? (
          <ModelsPanel
            state={state}
            dispatch={dispatch}
            favourites={favourites}
            onRefreshModels={props.onRefreshModels}
          />
        ) : view === "providers" ? (
          <ProvidersPanel state={state} onRefreshModels={props.onRefreshModels} />
        ) : (
          <SettingsPanel state={state} dispatch={dispatch} onLogout={onLogout} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav                                                                 */
/* ------------------------------------------------------------------ */

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        active
          ? "bg-surface-raised font-medium text-ink-strong shadow-sm"
          : "text-ink-muted hover:bg-surface-sunken hover:text-ink-strong",
      )}
    >
      <span className={cn("shrink-0", active ? "text-brand-600 dark:text-brand-300" : "text-ink-faint")}>
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{count}</span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

function HistoryPanel({
  state,
  dispatch,
  query,
  onQueryChange,
  groups,
  onOpenConversation,
  onDeleteConversation,
  onRefreshConversations,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  query: string;
  onQueryChange: (value: string) => void;
  groups: Array<[string, AppState["conversations"]]>;
  onOpenConversation: (id: string) => void | Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  onRefreshConversations: () => Promise<unknown>;
}) {
  const [foldersOpen, setFoldersOpen] = useState(true);

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="px-2.5">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
            <SearchIcon size={14} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className={cn(
              "h-8 w-full rounded-md border border-line-subtle bg-surface-raised pl-8 pr-2.5 text-[13px]",
              "placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25",
            )}
          />
        </div>
      </div>

      {/* Mode shortcut */}
      <div className="px-2.5">
        <button
          type="button"
          onClick={() =>
            dispatch({ type: "mode/set", mode: state.mode === "compare" ? "single" : "compare" })
          }
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border px-2.5 text-[12px] transition-colors",
            state.mode === "compare"
              ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200"
              : "border-line-subtle text-ink-muted hover:bg-surface-sunken hover:text-ink-strong",
          )}
        >
          <CompareIcon size={14} />
          {state.mode === "compare"
            ? `Comparing ${state.panes.length} model${state.panes.length === 1 ? "" : "s"}`
            : "Switch to 4-pane comparison"}
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[13px] text-ink-muted">
            {query ? "No conversations match your search." : "No conversations yet."}
          </p>
          {!query ? (
            <p className="mt-1 text-[12px] text-ink-faint">
              Start a new chat to see it here.
            </p>
          ) : null}
        </div>
      ) : (
        groups.map(([bucket, items]) => (
          <section key={bucket} className="flex flex-col">
            <h3 className="px-4 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {bucket}
            </h3>
            <ul className="flex flex-col px-1.5">
              {items.map((conversation) => {
                const isActive = conversation.id === state.activeConversationId;
                return (
                  <li key={conversation.id} className="group/conv relative">
                    <button
                      type="button"
                      onClick={() => void onOpenConversation(conversation.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 pr-9 text-left",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                        isActive
                          ? "bg-surface-raised text-ink-strong"
                          : "text-ink-muted hover:bg-surface-sunken hover:text-ink-strong",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] leading-5">
                          {truncate(conversation.title, 42) || "Untitled"}
                        </span>
                        <span className="mt-px block text-[11px] text-ink-faint">
                          {conversation.messageCount > 0
                            ? `${conversation.messageCount} messages · ${formatRelativeTime(conversation.updatedAt)}`
                            : formatRelativeTime(conversation.updatedAt)}
                        </span>
                      </span>
                      {conversation.paneCount > 1 ? (
                        <span
                          title={`${conversation.paneCount}-pane comparison`}
                          className="shrink-0 rounded border border-line-subtle px-1 text-[10px] font-medium text-ink-faint"
                        >
                          {conversation.paneCount}×
                        </span>
                      ) : null}
                    </button>

                    <button
                      type="button"
                      aria-label={`Delete "${conversation.title || "Untitled"}"`}
                      onClick={() => void onDeleteConversation(conversation.id)}
                      className={cn(
                        "absolute right-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center",
                        "rounded-md text-ink-faint transition-colors hover:bg-state-danger-bg hover:text-state-danger-strong",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-state-danger",
                        "group-hover/conv:flex",
                      )}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <div className="px-2.5 pt-1">
        <button
          type="button"
          onClick={() => {
            setFoldersOpen((v) => !v);
            void onRefreshConversations();
          }}
          className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint transition-colors hover:text-ink-muted"
        >
          <span className={cn("transition-transform", foldersOpen && "rotate-90")}>
            <ChevronIcon size={11} />
          </span>
          Folders
        </button>
        {foldersOpen && state.folders.length === 0 ? (
          <p className="px-1 pt-1 text-[11px] text-ink-faint">
            Folders group conversations. None yet.
          </p>
        ) : null}
        {foldersOpen
          ? state.folders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center gap-1.5 rounded-md px-1 py-1 text-[12px] text-ink-muted"
              >
                <FolderIcon size={13} />
                <span className="truncate">{folder.name}</span>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Model library                                                       */
/* ------------------------------------------------------------------ */

function ModelsPanel({
  state,
  dispatch,
  favourites,
  onRefreshModels,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  favourites: ModelWithProvider[];
  onRefreshModels: () => Promise<unknown>;
}) {
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const providers = useMemo(() => {
    const unique = new Map<string, ProviderConfig>();
    for (const m of state.models) {
      const p = state.providers.find((pp) => pp.id === m.providerId);
      if (p) unique.set(p.id, p);
    }
    return Array.from(unique.values());
  }, [state.models, state.providers]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return state.models
      .filter((m) => providerFilter === "all" || m.providerId === providerFilter)
      .filter(
        (m) =>
          !needle ||
          m.modelId.toLowerCase().includes(needle) ||
          m.displayName.toLowerCase().includes(needle) ||
          m.provider.displayName.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [state.models, providerFilter, search]);

  if (state.models.length === 0) {
    return (
      <EmptyPanel
        icon={<LibraryIcon size={18} />}
        title="No models discovered yet"
        body="Add a provider with an API key, then refresh its model list. Models appear here with the metadata the provider actually reports."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5 py-3">
      <div className="px-2.5">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
            <SearchIcon size={14} />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models"
            aria-label="Search models"
            className="h-8 w-full rounded-md border border-line-subtle bg-surface-raised pl-8 pr-2.5 text-[13px] placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4">
        <span className="text-[11px] tabular-nums text-ink-faint">
          {visible.length} of {state.models.length}
        </span>
        <button
          type="button"
          onClick={() => void onRefreshModels()}
          className="text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Refresh
        </button>
      </div>

      {favourites.length > 0 && !search && providerFilter === "all" ? (
        <section className="px-2.5">
          <h3 className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Favourites
          </h3>
          <ul className="flex flex-wrap gap-1">
            {favourites.map((model) => (
              <li key={`${model.providerId}:${model.modelId}`}>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "selection/model",
                      providerId: model.providerId,
                      modelId: model.modelId,
                    })
                  }
                  title={`${model.provider.displayName} · ${model.modelId}`}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                    "transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    state.selectedProviderId === model.providerId &&
                    state.selectedModelId === model.modelId
                      ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200"
                      : "border-line-subtle text-ink-muted",
                  )}
                >
                  <StarIcon size={10} />
                  <span className="truncate">{model.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="px-2.5">
        <label className="sr-only" htmlFor="provider-filter">
          Filter by provider
        </label>
        <select
          id="provider-filter"
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="h-8 w-full rounded-md border border-line-subtle bg-surface-raised px-2 text-[12px] text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
        >
          <option value="all">All providers</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>

      <ul className="flex flex-col px-1.5">
        {visible.map((model) => (
          <ModelRow
            key={`${model.providerId}:${model.modelId}`}
            model={model}
            active={
              state.selectedProviderId === model.providerId &&
              state.selectedModelId === model.modelId
            }
            onSelect={() =>
              dispatch({
                type: "selection/model",
                providerId: model.providerId,
                modelId: model.modelId,
              })
            }
            onFavourite={() =>
              void (async () => {
                try {
                  await setFavourite(model.providerId, model.modelId, !model.favourite);
                } catch {
                  /* the favourite did not change; keep the previous value visible */
                }
                await onRefreshModels();
              })()
            }
            onPin={() =>
              void (async () => {
                try {
                  await setPinned(model.providerId, model.modelId, !model.pinned);
                } catch {
                  /* the pin did not change; keep the previous value visible */
                }
                await onRefreshModels();
              })()
            }
          />
        ))}
      </ul>
    </div>
  );
}

function ModelRow({
  model,
  active,
  onSelect,
  onFavourite,
  onPin,
}: {
  model: ModelWithProvider;
  active: boolean;
  onSelect: () => void;
  onFavourite: () => void;
  onPin: () => void;
}) {
  return (
    <li className="group/model relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          active ? "bg-surface-raised" : "hover:bg-surface-sunken",
        )}
      >
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-strong">
            {model.displayName}
          </span>
          {model.pinned ? (
            <span className="shrink-0 text-brand-600 dark:text-brand-300">
              <PinIcon size={11} />
            </span>
          ) : null}
          {model.capabilities.vision === "provider" ? (
            <span
              className="shrink-0 rounded border border-line-subtle px-1 text-[9px] text-ink-faint"
              title="Vision reported by the provider"
            >
              vision
            </span>
          ) : null}
        </span>
        <span className="truncate text-[11px] text-ink-faint">
          {model.provider.displayName}
        </span>
      </button>

      <div className="absolute right-1 top-1 hidden gap-0.5 group-hover/model:flex">
        <IconAction
          label={model.favourite ? "Remove from favourites" : "Add to favourites"}
          active={model.favourite}
          onClick={onFavourite}
        >
          <StarIcon size={13} />
        </IconAction>
        <IconAction label={model.pinned ? "Unpin" : "Pin"} active={model.pinned} onClick={onPin}>
          <PinIcon size={13} />
        </IconAction>
      </div>
    </li>
  );
}

function IconAction({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
        active
          ? "text-brand-600 dark:text-brand-300"
          : "text-ink-faint hover:bg-surface-sunken hover:text-ink-strong",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

function ProvidersPanel({
  state,
  onRefreshModels,
}: {
  state: AppState;
  onRefreshModels: () => Promise<unknown>;
}) {
  return (
    <div className="flex flex-col gap-2.5 py-3">
      <div className="flex items-center justify-between px-4">
        <span className="text-[11px] tabular-nums text-ink-faint">
          {state.providers.length} connected
        </span>
      </div>

      {state.providers.length === 0 ? (
        <EmptyPanel
          icon={<KeyIcon size={18} />}
          title="No providers yet"
          body="Add a provider and paste your own API key. Keys are encrypted server-side and are never returned to this browser."
        />
      ) : (
        <ul className="flex flex-col gap-1.5 px-2.5">
          {state.providers.map((provider) => (
            <li
              key={provider.id}
              className="rounded-lg border border-line-subtle bg-surface-raised p-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    provider.connectionStatus === "ok"
                      ? "bg-state-positive"
                      : provider.connectionStatus === "error"
                        ? "bg-state-danger"
                        : "bg-line-strong",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-strong">
                  {provider.displayName}
                </span>
                {provider.hasApiKey ? (
                  <span className="shrink-0 rounded border border-line-subtle px-1 text-[9px] text-ink-faint">
                    key
                  </span>
                ) : (
                  <span className="shrink-0 rounded border border-state-warning/40 px-1 text-[9px] text-state-warning-strong">
                    no key
                  </span>
                )}
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-ink-faint">
                {provider.baseUrl}
              </p>
              {provider.apiKeyHint ? (
                <p className="mt-0.5 font-mono text-[10px] text-ink-faint">
                  …{provider.apiKeyHint}
                </p>
              ) : null}
              {provider.connectionError ? (
                <p className="mt-1 text-[11px] leading-snug text-state-danger-strong">
                  {provider.connectionError}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-ink-faint">
                {(provider.modelCount ?? 0) > 0
                  ? `${provider.modelCount} models`
                  : "Models not discovered"}
                {provider.lastModelDiscoveryAt
                  ? ` · refreshed ${formatRelativeTime(provider.lastModelDiscoveryAt)}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="px-4">
        <button
          type="button"
          onClick={() => void onRefreshModels()}
          className="text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Refresh discovered models
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function SettingsPanel({
  state,
  dispatch,
  onLogout,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onLogout: () => void | Promise<void>;
}) {
  const { theme, toggle } = useThemeFromState(state, dispatch);
  const user: UserProfile | null = state.user;

  return (
    <div className="flex flex-col gap-4 py-3">
      {user ? (
        <section className="px-4">
          <h3 className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Account
          </h3>
          <div className="flex items-center gap-2.5 rounded-lg border border-line-subtle bg-surface-raised p-2.5">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full border border-line-subtle"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-[12px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
                <UserIcon size={14} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink-strong">
                {user.name ?? "Signed in"}
              </p>
              {user.email ? (
                <p className="truncate text-[11px] text-ink-faint">{user.email}</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-4">
        <h3 className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Appearance
        </h3>
        <button
          type="button"
          onClick={toggle}
          className="flex h-9 w-full items-center gap-2.5 rounded-md border border-line-subtle px-2.5 text-[13px] text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink-strong"
        >
          {theme === "dark" ? <MoonIcon size={15} /> : <SunIcon size={15} />}
          {theme === "dark" ? "Dark theme" : "Light theme"}
          <span className="ml-auto text-[11px] text-ink-faint">Switch</span>
        </button>
      </section>

      <section className="px-4">
        <h3 className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Request routing
        </h3>
        <RoutingPreference state={state} dispatch={dispatch} />
      </section>

      <section className="px-4">
        <button
          type="button"
          onClick={() => void onLogout()}
          className="h-9 w-full rounded-md border border-line-strong text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink-strong"
        >
          Sign out
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Signing out clears the session cookie on this device. Your providers,
          models and conversations stay encrypted on the server.
        </p>
      </section>
    </div>
  );
}

/**
 * Server-mediated is the default and the only mode that works today: it keeps
 * keys off the browser entirely. The direct-from-browser option is shown as
 * disabled with an honest explanation rather than hidden or faked.
 */
function RoutingPreference({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}) {
  const direct = state.prefs?.directBrowser === true;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface-raised p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-ink-strong">Server-mediated requests</p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
            The server holds your encrypted key and makes the upstream call. Your
            key never reaches the browser.
          </p>
        </div>
        <span className="mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-brand-600 px-0.5">
          <span className="ml-auto h-4 w-4 rounded-full bg-white" />
        </span>
      </div>
      <div className="h-px bg-line-subtle" />
      <div className="flex items-start justify-between gap-2 opacity-60">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-ink-strong">Direct from browser</p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
            Requires per-provider CORS support and a client-side key check, so
            ROSA does not authorise it yet.
          </p>
        </div>
        <span className="mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-line-strong px-0.5">
          <span className="h-4 w-4 rounded-full bg-surface" />
        </span>
      </div>
      {direct ? (
        <p className="text-[11px] text-state-warning-strong">
          A stored preference asks for direct routing. It is ignored until the
          client key check ships.
        </p>
      ) : null}
      <button
        type="button"
        onClick={() =>
          dispatch({ type: "toast/push", toast: { id: `route-${Date.now()}`, tone: "info", message: "Server-mediated routing is the only supported mode in this version." } })
        }
        className="sr-only"
      >
        Explain routing
      </button>
    </div>
  );
}

function useThemeFromState(state: AppState, dispatch: React.Dispatch<Action>) {
  const { theme, toggle } = useThemeLocal();
  void state;
  void dispatch;
  return { theme, toggle };
}

/** Local-only theme toggle; persisted in the browser, never on the server. */
function useThemeLocal() {
  return useThemeBrowser();
}

import { useTheme as useThemeBrowser } from "../../lib/hooks.js";

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

function EmptyPanel({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="mx-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-subtle px-4 py-7 text-center">
      <span className="text-ink-faint">{icon}</span>
      <p className="text-[13px] font-medium text-ink-strong">{title}</p>
      <p className="text-[12px] leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}
