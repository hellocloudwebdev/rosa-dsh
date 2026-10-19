import { useState, useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Search, Star, Plus, Eye, Wrench, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
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
  const [isAuto, setIsAuto] = useState(false);

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

  // Check if a model supports vision
  const checkVision = (m: ModelWithProvider) =>
    m.capabilities?.vision === "provider" ||
    m.capabilities?.vision === "inferred" ||
    m.capabilities?.inputModalities?.includes("image");

  // Filter models by query and tag
  const filteredModels = useMemo(() => {
    let list = models;
    if (filterTag === "fav") {
      list = list.filter((m) => m.favourite);
    } else if (filterTag === "vision") {
      list = list.filter(checkVision);
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

  // Order sections: Favourites FIRST -> Vision SECOND -> All Models THIRD
  const orderedSections = useMemo(() => {
    if (filterTag === "fav") {
      return [{ id: "fav", title: "Favourites", icon: Star, items: filteredModels }];
    }
    if (filterTag === "vision") {
      return [{ id: "vision", title: "Vision Models", icon: Eye, items: filteredModels }];
    }
    if (filterTag === "tools") {
      return [{ id: "tools", title: "Tools / Function Calling", icon: Wrench, items: filteredModels }];
    }

    // Default "all" view:
    const favs = filteredModels.filter((m) => m.favourite);
    const vision = filteredModels.filter((m) => !m.favourite && checkVision(m));
    const others = filteredModels.filter((m) => !m.favourite && !checkVision(m));

    const sections = [];
    if (favs.length > 0) {
      sections.push({ id: "fav", title: "Favourites", icon: Star, items: favs });
    }
    if (vision.length > 0) {
      sections.push({ id: "vision", title: "Vision Models", icon: Eye, items: vision });
    }
    if (others.length > 0 || sections.length === 0) {
      sections.push({
        id: "all",
        title: favs.length > 0 || vision.length > 0 ? "All Models" : "Available Models",
        icon: Sparkles,
        items: others.length > 0 ? others : filteredModels,
      });
    }
    return sections;
  }, [filteredModels, filterTag]);

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
        <motion.button
          whileTap={{ scale: 0.96 }}
          type="button"
          disabled={disabled}
          className={`flex items-center gap-2 h-8 px-3 rounded-full text-xs font-medium cursor-pointer outline-none transition-all border bg-neutral-100/90 dark:bg-white/10 hover:bg-neutral-200/80 dark:hover:bg-white/15 border-neutral-200/80 dark:border-white/10 text-neutral-800 dark:text-neutral-100 shadow-2xs ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {isAuto ? (
            <div className="flex items-center gap-1.5 font-medium">
              <span>Auto</span>
              <div className="w-5 h-3 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center px-0.5">
                <div className="w-2 h-2 rounded-full bg-white ml-auto" />
              </div>
            </div>
          ) : activeModel ? (
            <>
              <AceStudioIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[130px] sm:max-w-[170px] font-medium">
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
        </motion.button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="w-[340px] max-h-[460px] flex flex-col rounded-2xl p-2 z-50 border shadow-2xl bg-white/95 dark:bg-[#1e1f23]/95 backdrop-blur-md border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-neutral-100 focus:outline-none animate-in fade-in-50 zoom-in-95 duration-100"
        >
          {/* Search bar */}
          <div
            className="flex items-center gap-2 rounded-xl px-2.5 h-8 mb-2 shrink-0 border bg-neutral-100 dark:bg-black/30 border-neutral-200 dark:border-white/5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="w-full bg-transparent outline-none text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
          </div>

          {/* Auto Selector Row */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              setIsAuto(!isAuto);
            }}
            className="flex items-center justify-between px-2.5 py-1.5 mb-1.5 rounded-xl text-xs hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="flex flex-col">
              <span className="font-medium">Auto Model Routing</span>
              <span className="text-[10px] text-neutral-400">Routes dynamically based on prompt complexity</span>
            </div>
            <button
              type="button"
              className={`w-7 h-4 rounded-full transition-colors flex items-center px-0.5 ${
                isAuto ? "bg-blue-500 dark:bg-blue-600" : "bg-neutral-300 dark:bg-white/20"
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transition-transform ${
                  isAuto ? "translate-x-3" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Quick Filter Bar */}
          <div className="flex items-center gap-1 px-1 mb-2 shrink-0 border-b border-neutral-100 dark:border-white/5 pb-2">
            {[
              { id: "all", label: "All" },
              { id: "fav", label: "★ Favourites" },
              { id: "vision", label: "Vision" },
              { id: "tools", label: "Tools" },
            ].map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => setFilterTag(tag.id as FilterTag)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors cursor-pointer ${
                  filterTag === tag.id
                    ? "bg-[#c6f232] text-black font-semibold shadow-2xs"
                    : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>

          {/* Ordered Sections: Favourites -> Vision -> All Models */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
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
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold bg-[#c6f232] text-black hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
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
              orderedSections.map((section) => (
                <div key={section.id} className="space-y-0.5">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <section.icon className="w-3 h-3 text-amber-400 dark:text-amber-300" />
                      <span>{section.title}</span>
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {section.items.length}
                    </span>
                  </div>

                  {section.items.map((m) => {
                    const isSelected =
                      !isAuto &&
                      activeModel?.providerId === m.providerId &&
                      activeModel?.modelId === m.modelId;
                    const ctx = formatContext(m.contextWindow);
                    const hasVision = checkVision(m);
                    const hasTools =
                      m.capabilities?.tools === "provider" || m.capabilities?.tools === "inferred";

                    return (
                      <div
                        key={`${section.id}:${m.providerId}:${m.modelId}`}
                        onClick={() => {
                          setIsAuto(false);
                          onSelectModel({
                            providerId: m.providerId,
                            modelId: m.modelId,
                            label: m.displayName || m.modelId,
                          });
                          setOpen(false);
                        }}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition-colors group ${
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
                              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate max-w-[180px]">
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

                          {/* Star Favourite button — ALWAYS visible on all model rows */}
                          {onToggleFavourite && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavourite(m.providerId, m.modelId, m.favourite);
                              }}
                              className="p-1 rounded-md transition-all cursor-pointer flex items-center justify-center hover:scale-110 active:scale-95"
                              title={m.favourite ? "Remove from favourites" : "Add to favourites"}
                              aria-label={m.favourite ? "Remove from favourites" : "Add to favourites"}
                            >
                              <Star
                                className={`w-3.5 h-3.5 transition-colors ${
                                  m.favourite
                                    ? "fill-amber-400 text-amber-400 stroke-amber-400"
                                    : "fill-transparent text-neutral-300 dark:text-neutral-600 hover:text-amber-400 hover:fill-amber-400/20"
                                }`}
                              />
                            </button>
                          )}

                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white stroke-[2.5]" />
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
          <div className="pt-2 mt-1 border-t border-neutral-100 dark:border-white/5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenProvidersModal();
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manage Custom Providers & Keys</span>
            </button>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
