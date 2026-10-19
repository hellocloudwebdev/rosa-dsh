import { useState, useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Search, Star, Plus, Eye, Wrench } from "lucide-react";
import type { ModelWithProvider } from "@shared/types.js";
import { ModelIcon, AceStudioIcon } from "./icons";

interface ModelMenuProps {
  models: ModelWithProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (m: { providerId: string; modelId: string; label?: string }) => void;
  onOpenProvidersModal: () => void;
  onToggleFavourite?: (providerId: string, modelId: string, current: boolean) => void;
  variant?: "dark" | "light";
  disabled?: boolean;
}

type FilterTag = "all" | "fav" | "vision" | "tools";

export function ModelMenu({
  models,
  selectedModel,
  onSelectModel,
  onOpenProvidersModal,
  onToggleFavourite,
  disabled = false,
}: ModelMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filterTag, setFilterTag] = useState<FilterTag>("all");

  // Find active model object
  const activeModel = useMemo(() => {
    if (!selectedModel) return models[0] || null;
    return (
      models.find(
        (m) =>
          m.providerId === selectedModel.providerId && m.modelId === selectedModel.modelId,
      ) || null
    );
  }, [models, selectedModel]);

  // Filter models by query and tag
  const filteredModels = useMemo(() => {
    let list = models;
    if (filterTag === "fav") {
      list = list.filter((m) => m.favourite);
    } else if (filterTag === "vision") {
      list = list.filter(
        (m) =>
          m.capabilities?.vision === "provider" ||
          m.capabilities?.vision === "inferred" ||
          m.capabilities?.inputModalities?.includes("image"),
      );
    } else if (filterTag === "tools") {
      list = list.filter(
        (m) => m.capabilities?.tools === "provider" || m.capabilities?.tools === "inferred",
      );
    }

    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.modelId.toLowerCase().includes(q) ||
        m.provider?.displayName?.toLowerCase().includes(q),
    );
  }, [models, query, filterTag]);

  // Group models by provider
  const grouped = useMemo(() => {
    const map = new Map<string, { providerName: string; providerKind: string; items: ModelWithProvider[] }>();
    for (const m of filteredModels) {
      const pid = m.providerId;
      if (!map.has(pid)) {
        map.set(pid, {
          providerName: m.provider?.displayName || "Provider",
          providerKind: m.provider?.kind || "custom",
          items: [],
        });
      }
      map.get(pid)!.items.push(m);
    }
    return Array.from(map.values());
  }, [filteredModels]);

  const formatContext = (tokens: number | null) => {
    if (!tokens) return null;
    if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M`;
    if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
    return `${tokens}`;
  };

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(o) => {
        if (disabled) return;
        setOpen(o);
        if (!o) {
          setQuery("");
          setFilterTag("all");
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`flex items-center gap-2 h-8 px-2.5 rounded-lg text-xs font-semibold cursor-pointer outline-none transition-colors border bg-white dark:bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] border-[var(--border-strong)] text-[var(--text-primary)] shadow-2xs ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {activeModel ? (
            <>
              <AceStudioIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[130px] sm:max-w-[160px] font-medium">
                {activeModel.displayName || activeModel.modelId}
              </span>
            </>
          ) : (
            <>
              <AceStudioIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium">Select Model</span>
            </>
          )}
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="w-[330px] max-h-[420px] flex flex-col rounded-xl p-1.5 z-50 border shadow-xl dark:shadow-2xl bg-white dark:bg-[#202721] border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-neutral-100 focus:outline-none"
        >
          {/* Search bar */}
          <div
            className="flex items-center gap-2 rounded-lg px-2.5 h-8 mb-1.5 shrink-0 border bg-neutral-100 dark:bg-black/30 border-neutral-200 dark:border-white/5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models or providers…"
              className="w-full bg-transparent outline-none text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500"
            />
          </div>

          {/* Quick Filter Bar */}
          <div className="flex items-center gap-1 px-1 mb-1.5 shrink-0">
            {[
              { id: "all", label: "All" },
              { id: "fav", label: "★ Favs" },
              { id: "vision", label: "Vision" },
              { id: "tools", label: "Tools" },
            ].map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => setFilterTag(tag.id as FilterTag)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                  filterTag === tag.id
                    ? "bg-[var(--lime)] text-white"
                    : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>

          {/* Model Groups */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {models.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                  No models discovered yet. Add a provider or local Ollama endpoint to begin.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenProvidersModal();
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-[var(--lime)] text-white hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Configure Providers</span>
                </button>
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
                No matching models found.
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.providerName} className="space-y-0.5">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <ModelIcon type={group.providerKind} className="w-3 h-3" />
                      <span>{group.providerName}</span>
                    </span>
                    <span className="text-[10px] lowercase text-neutral-500 font-mono">
                      {group.items.length}
                    </span>
                  </div>

                  {group.items.map((m) => {
                    const isSelected =
                      activeModel?.providerId === m.providerId &&
                      activeModel?.modelId === m.modelId;
                    const ctx = formatContext(m.contextWindow);
                    const hasVision =
                      m.capabilities?.vision === "provider" ||
                      m.capabilities?.vision === "inferred" ||
                      m.capabilities?.inputModalities?.includes("image");
                    const hasTools =
                      m.capabilities?.tools === "provider" || m.capabilities?.tools === "inferred";

                    return (
                      <div
                        key={`${m.providerId}:${m.modelId}`}
                        onClick={() => {
                          onSelectModel({
                            providerId: m.providerId,
                            modelId: m.modelId,
                            label: m.displayName || m.modelId,
                          });
                          setOpen(false);
                        }}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors group ${
                          isSelected
                            ? "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white font-semibold"
                            : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <ModelIcon type={m.provider?.kind || m.modelId} className="w-3.5 h-3.5 shrink-0" />
                          <div className="min-w-0 flex flex-col">
                            <span className="truncate font-medium">{m.displayName || m.modelId}</span>
                            {m.description && (
                              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-[190px]">
                                {m.description}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasVision && (
                            <span title="Supports Vision / Images">
                              <Eye className="w-3 h-3 text-sky-400" />
                            </span>
                          )}
                          {hasTools && (
                            <span title="Supports Function Calling / Tools">
                              <Wrench className="w-3 h-3 text-purple-400" />
                            </span>
                          )}
                          {ctx && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-200/80 dark:bg-black/40 text-neutral-600 dark:text-neutral-400">
                              {ctx}
                            </span>
                          )}

                          {onToggleFavourite && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavourite(m.providerId, m.modelId, m.favourite);
                              }}
                              className={`p-0.5 rounded transition-colors ${
                                m.favourite
                                  ? "text-amber-500"
                                  : "text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-amber-500"
                              }`}
                              title={m.favourite ? "Remove from favourites" : "Add to favourites"}
                            >
                              <Star className="w-3 h-3 fill-current" />
                            </button>
                          )}

                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer: Manage Providers button */}
          <div className="pt-1.5 mt-1 border-t border-neutral-200 dark:border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenProvidersModal();
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Manage Custom Providers & Keys</span>
            </button>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
