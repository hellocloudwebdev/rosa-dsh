import { useState } from "react";
import {
  Server,
  RotateCcw,
  PanelRight,
  ChevronDown,
  Check,
  BarChart2,
  GitCompare,
  FileText,
  Code2,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { SignInButton, UserButton, useAuth } from "@clerk/react";
import type { ViewType } from "../types";
import { AceStudioIcon } from "./composer/icons";

interface StudioHeaderProps {
  conversationTitle: string;
  onUpdateTitle: (title: string) => void;
  paneCount: 1 | 2 | 3 | 4;
  onSetPaneCount: (count: 1 | 2 | 3 | 4) => void;
  providerCount: number;
  onOpenProvidersModal: () => void;
  onResetChat: () => void;
  viewType: ViewType | null;
  onOpenView: (t: ViewType) => void;
}

const VIEW_OPTIONS: { type: ViewType; label: string; icon: typeof BarChart2 }[] = [
  { type: "inspector", label: "Metrics & Inspector", icon: BarChart2 },
  { type: "diff", label: "Side-by-Side Diff", icon: GitCompare },
  { type: "markdown", label: "Raw Markdown", icon: FileText },
  { type: "json", label: "JSON Event Trace", icon: Code2 },
];

export function StudioHeader({
  conversationTitle,
  onUpdateTitle,
  paneCount,
  onSetPaneCount,
  providerCount,
  onOpenProvidersModal,
  onResetChat,
  viewType,
  onOpenView,
}: StudioHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversationTitle);
  const { isSignedIn } = useAuth();

  const handleFinishEditing = () => {
    setIsEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== conversationTitle) {
      onUpdateTitle(titleDraft.trim());
    }
  };

  return (
    <header className="border-b border-[var(--border-subtle)] px-4 sm:px-6 py-2.5 flex items-center justify-between bg-[var(--bg-panel)] shrink-0 z-20 transition-colors">
      {/* Left: Breadcrumbs & Editable Conversation Title */}
      <div className="flex items-center gap-3 overflow-hidden min-w-0">
        <div className="hidden lg:flex items-center gap-2 text-xs text-[var(--text-muted)] shrink-0">
          <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <AceStudioIcon className="w-3.5 h-3.5" />
            <span>Ace Studio</span>
          </span>
          <span>/</span>
          <span>Workspace</span>
          <span>/</span>
        </div>

        {isEditingTitle ? (
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleFinishEditing}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFinishEditing();
              if (e.key === "Escape") setIsEditingTitle(false);
            }}
            autoFocus
            className="text-xs font-semibold text-[var(--text-primary)] bg-[var(--active-overlay)] px-2 py-1 rounded-lg outline-none w-56 sm:w-72 border border-[var(--lime)]"
          />
        ) : (
          <h2
            onClick={() => {
              setTitleDraft(conversationTitle);
              setIsEditingTitle(true);
            }}
            className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] tracking-tight cursor-pointer hover:bg-[var(--hover-overlay)] px-2 py-1 rounded-lg transition-colors truncate max-w-[200px] sm:max-w-xs md:max-w-md"
            title="Click to rename conversation"
          >
            {conversationTitle || "New Conversation"}
          </h2>
        )}

        {/* Active Providers Chip */}
        <button
          onClick={onOpenProvidersModal}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--lime)]/10 text-[var(--lime-text)] border border-[var(--lime)]/20 hover:bg-[var(--lime)]/20 transition-colors cursor-pointer shrink-0"
          title="Open Custom Providers Configuration"
        >
          <Server className="w-3 h-3" />
          <span>{providerCount} {providerCount === 1 ? "Provider" : "Providers"}</span>
        </button>
      </div>

      {/* Right: Comparison Panes Selector, Views, Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Pane Count / Comparison Mode Selector */}
        <div className="flex items-center rounded-lg border border-[var(--border-strong)] bg-[var(--bg-panel-2)] p-0.5">
          {([1, 2, 3, 4] as const).map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => onSetPaneCount(count)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                paneCount === count
                  ? "bg-[#c6f232] text-black font-semibold shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              title={count === 1 ? "Single Model Chat" : `Compare ${count} Models Side-by-Side`}
            >
              {count === 1 ? "1 Pane" : `${count}x`}
            </button>
          ))}
        </div>

        {/* Open contextual View panel */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors cursor-pointer ${
                viewType
                  ? "border-[var(--lime)]/60 bg-[var(--lime)]/15 text-[var(--lime-text)]"
                  : "border-[var(--border-strong)] bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <PanelRight className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {viewType ? (VIEW_OPTIONS.find((v) => v.type === viewType)?.label ?? "View") : "Inspector"}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="w-52 bg-white dark:bg-[#202721] text-neutral-900 dark:text-neutral-100 rounded-xl p-1.5 border border-neutral-200 dark:border-white/10 shadow-xl dark:shadow-2xl z-50 focus:outline-none"
            >
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Inspector Panels
              </div>
              {VIEW_OPTIONS.map((v) => {
                const VIcon = v.icon;
                return (
                  <DropdownMenu.Item
                    key={v.type}
                    onSelect={() => onOpenView(v.type)}
                    className={`flex items-center justify-between px-2.5 py-2 text-xs rounded-lg cursor-pointer outline-none transition-colors ${
                      viewType === v.type
                        ? "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white font-semibold"
                        : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <VIcon className="w-3.5 h-3.5 text-[var(--lime-text)]" />
                      <span>{v.label}</span>
                    </span>
                    {viewType === v.type && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Reset Chat button */}
        <button
          onClick={onResetChat}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-[var(--border-strong)] bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Clear & Reset current chat"
        >
          <RotateCcw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        {/* User Auth: Clerk or Dev */}
        <div className="flex items-center ml-1 border-l border-[var(--border-subtle)] pl-2">
          {!isSignedIn ? (
            <SignInButton mode="modal">
              <button className="px-2.5 py-1.5 text-xs font-semibold border border-[var(--border-strong)] rounded-lg hover:bg-[var(--hover-overlay)] text-[var(--text-primary)] transition-colors cursor-pointer">
                Sign In
              </button>
            </SignInButton>
          ) : (
            <UserButton />
          )}
        </div>
      </div>
    </header>
  );
}
