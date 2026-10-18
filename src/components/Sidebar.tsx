import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Server,
  Folder,
  FolderPlus,
  MessageSquare,
  Search,
  MoreVertical,
  Pin,
  Trash2,
  Edit2,
  Sparkles,
  Layers,
  Sun,
  Moon,
  Bot,
  Check,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Conversation, Folder as FolderType, UserProfile } from "@shared/types.js";
import type { NavItemId } from "../types";

export type Theme = "dark" | "light";

interface SidebarProps {
  activeNav: NavItemId;
  onSelectNav: (id: NavItemId) => void;
  conversations: Array<Conversation & { messageCount: number; lastMessageAt: number | null }>;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onTogglePinConversation: (id: string, current: boolean) => void;
  folders: FolderType[];
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenProvidersModal: () => void;
  onOpenPromptLibraryModal: () => void;
  providerCount: number;
  user: UserProfile | null;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  width: number;
  onWidthChange: (w: number) => void;
}

export const SIDEBAR_MIN = 240;
export const SIDEBAR_MAX = 420;

const WORKSPACE_MODES = [
  { id: "all", name: "All Models & Providers" },
  { id: "local", name: "Local Ollama / LM Studio" },
  { id: "cloud", name: "Cloud APIs (OpenAI / Anthropic)" },
  { id: "compare", name: "Benchmark & Comparison" },
];

export function Sidebar({
  activeNav,
  onSelectNav,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onTogglePinConversation,
  folders,
  onCreateFolder,
  onDeleteFolder,
  isCollapsed,
  onToggleCollapse,
  onOpenProvidersModal,
  onOpenPromptLibraryModal,
  providerCount,
  user,
  theme,
  onSetTheme,
  width,
  onWidthChange,
}: SidebarProps) {
  const [workspace, setWorkspace] = useState("All Models & Providers");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const isDark = theme === "dark";

  const handleResizeStart = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: PointerEvent) => {
      onWidthChange(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  const pinnedConversations = filteredConversations.filter((c) => c.pinned);
  const regularConversations = filteredConversations.filter((c) => !c.pinned);

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName("");
      setIsCreatingFolder(false);
    }
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <motion.aside
      initial={false}
      animate={{
        width: isCollapsed ? 72 : width,
        transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
      }}
      className="relative h-full bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] flex flex-col shrink-0 select-none overflow-hidden z-20 transition-colors"
    >
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden p-3.5 pt-4">
        {/* Brand Header */}
        <div className="flex items-center justify-between mb-4 px-1 min-h-[32px]">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-xl bg-[var(--lime)]/15 border border-[var(--lime)]/30 text-[var(--lime-text)] flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.15 }}
                  className="font-bold text-[16px] text-[var(--text-primary)] tracking-tight whitespace-nowrap"
                >
                  Rosa AI
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={onToggleCollapse}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer shrink-0"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Workspace selector (When expanded) */}
        {!isCollapsed && (
          <div className="mb-3 px-0.5">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="w-full flex items-center justify-between border border-[var(--border-strong)] rounded-xl px-2.5 h-9 bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer outline-none">
                  <span className="flex items-center gap-2 truncate">
                    <Layers className="w-3.5 h-3.5 text-[var(--lime-text)] shrink-0" />
                    <span className="truncate">{workspace}</span>
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={6}
                  className="w-56 bg-white dark:bg-[#202721] text-neutral-900 dark:text-neutral-100 rounded-xl p-1.5 border border-neutral-200 dark:border-white/10 shadow-xl dark:shadow-2xl z-50 focus:outline-none"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Workspace Filter
                  </div>
                  {WORKSPACE_MODES.map((ws) => (
                    <DropdownMenu.Item
                      key={ws.id}
                      onSelect={() => setWorkspace(ws.name)}
                      className={`flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg cursor-pointer outline-none transition-colors ${
                        workspace === ws.name
                          ? "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white font-semibold"
                          : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                      }`}
                    >
                      <span>{ws.name}</span>
                      {workspace === ws.name && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        )}

        {/* New Chat Primary Button */}
        <button
          onClick={() => {
            onSelectNav("new-chat");
            onNewChat();
          }}
          title={isCollapsed ? "New Chat (Ctrl+Shift+O)" : undefined}
          className={`w-full flex items-center justify-between h-9 rounded-xl font-semibold text-xs bg-[var(--lime)] text-white hover:opacity-90 transition-all cursor-pointer shadow-sm ${
            isCollapsed ? "justify-center px-0" : "px-3"
          }`}
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4 stroke-[2.4]" />
            {!isCollapsed && <span>New Conversation</span>}
          </span>
          {!isCollapsed && (
            <span className="text-[10px] opacity-75 font-mono">⌘⇧O</span>
          )}
        </button>

        {/* Quick Nav: Custom Providers & Prompt Library */}
        <div className="mt-3 space-y-1">
          <button
            onClick={() => {
              onSelectNav("providers");
              onOpenProvidersModal();
            }}
            title={isCollapsed ? "Custom Providers & Keys (Ctrl+P)" : undefined}
            className={`w-full flex items-center gap-2.5 h-8 rounded-lg text-xs transition-colors cursor-pointer ${
              activeNav === "providers"
                ? "bg-[var(--active-overlay)] text-[var(--text-primary)] font-semibold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)]"
            } ${isCollapsed ? "justify-center px-0" : "px-2.5"}`}
          >
            <Server className="w-3.5 h-3.5 text-[var(--lime-text)] shrink-0" />
            {!isCollapsed && (
              <>
                <span className="truncate flex-1 text-left">Custom Providers</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--lime)]/15 text-[var(--lime-text)] border border-[var(--lime)]/20 font-semibold">
                  {providerCount}
                </span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              onSelectNav("prompt-library");
              onOpenPromptLibraryModal();
            }}
            title={isCollapsed ? "Prompt Library" : undefined}
            className={`w-full flex items-center gap-2.5 h-8 rounded-lg text-xs transition-colors cursor-pointer ${
              activeNav === "prompt-library"
                ? "bg-[var(--active-overlay)] text-[var(--text-primary)] font-semibold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)]"
            } ${isCollapsed ? "justify-center px-0" : "px-2.5"}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            {!isCollapsed && <span className="truncate text-left flex-1">Prompt Library</span>}
          </button>
        </div>

        {/* Conversations Header with Search and + Folder */}
        {!isCollapsed && (
          <div className="mt-5 mb-2 px-1 flex items-center justify-between text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider">
            <span>Conversations</span>
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="p-1 rounded hover:bg-[var(--hover-overlay)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="Create folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Search bar (When expanded) */}
        {!isCollapsed && (
          <div className="mb-2 px-1">
            <div className="flex items-center gap-2 px-2.5 h-7 rounded-lg bg-[var(--bg-panel-2)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              <Search className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats…"
                className="w-full bg-transparent outline-none text-[11px]"
              />
            </div>
          </div>
        )}

        {/* Inline Folder Creation */}
        {isCreatingFolder && !isCollapsed && (
          <form onSubmit={handleCreateFolderSubmit} className="mb-2 px-1">
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name…"
              onBlur={() => setIsCreatingFolder(false)}
              className="w-full px-2 py-1 text-xs rounded-lg bg-[var(--bg-panel-2)] border border-[var(--lime)] outline-none text-[var(--text-primary)]"
            />
          </form>
        )}

        {/* Folders List */}
        {!isCollapsed && folders.length > 0 && (
          <div className="space-y-0.5 mb-2 px-1">
            {folders.map((f) => (
              <div key={f.id} className="group flex items-center justify-between text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded-lg hover:bg-[var(--hover-overlay)] cursor-pointer">
                <div onClick={() => toggleFolder(f.id)} className="flex items-center gap-1.5 truncate">
                  {expandedFolders[f.id] ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" /> : <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />}
                  <Folder className="w-3.5 h-3.5 text-[var(--lime-text)]" />
                  <span className="truncate">{f.name}</span>
                </div>
                <button
                  onClick={() => onDeleteFolder(f.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-400 hover:text-rose-400 transition-opacity cursor-pointer"
                  title="Delete folder"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto space-y-1 mt-1 pr-0.5">
          {pinnedConversations.length > 0 && !isCollapsed && (
            <div className="px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
              <Pin className="w-2.5 h-2.5 text-amber-400" />
              <span>Pinned</span>
            </div>
          )}

          {pinnedConversations.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              isActive={activeConversationId === c.id}
              isCollapsed={isCollapsed}
              onSelect={() => onSelectConversation(c.id)}
              onDelete={() => onDeleteConversation(c.id)}
              onTogglePin={() => onTogglePinConversation(c.id, c.pinned)}
              onRename={(t) => onRenameConversation(c.id, t)}
              isRenaming={renamingId === c.id}
              renameText={renameText}
              setRenameText={setRenameText}
              startRename={() => {
                setRenamingId(c.id);
                setRenameText(c.title);
              }}
              finishRename={() => {
                if (renameText.trim()) onRenameConversation(c.id, renameText.trim());
                setRenamingId(null);
              }}
            />
          ))}

          {regularConversations.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              isActive={activeConversationId === c.id}
              isCollapsed={isCollapsed}
              onSelect={() => onSelectConversation(c.id)}
              onDelete={() => onDeleteConversation(c.id)}
              onTogglePin={() => onTogglePinConversation(c.id, c.pinned)}
              onRename={(t) => onRenameConversation(c.id, t)}
              isRenaming={renamingId === c.id}
              renameText={renameText}
              setRenameText={setRenameText}
              startRename={() => {
                setRenamingId(c.id);
                setRenameText(c.title);
              }}
              finishRename={() => {
                if (renameText.trim()) onRenameConversation(c.id, renameText.trim());
                setRenamingId(null);
              }}
            />
          ))}

          {conversations.length === 0 && (
            <div className="text-center py-6 px-2 text-xs text-[var(--text-muted)]">
              No conversations yet
            </div>
          )}
        </div>
      </div>

      {/* Resize handle */}
      {!isCollapsed && (
        <div
          onPointerDown={handleResizeStart}
          className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-[var(--lime)]/60 transition-colors z-30"
          title="Drag to resize sidebar"
        />
      )}

      {/* Footer: User Profile & Light/Dark Theme Toggle */}
      <div className="p-3 border-t border-[var(--border-subtle)] shrink-0 transition-colors">
        {!isCollapsed ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2.5 flex-1 min-w-0 px-2 py-1.5 rounded-lg hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-neutral-600 to-neutral-800 border border-white/10 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : "DEV"}
              </div>
              <div className="flex flex-col overflow-hidden min-w-0">
                <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                  {user?.name || "Local Developer"}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] truncate font-mono">
                  {user?.email || "localhost:8787"}
                </span>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={() => onSetTheme(isDark ? "light" : "dark")}
              className="w-8 h-8 rounded-lg bg-[var(--bg-panel-2)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-neutral-600" />}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-neutral-700 text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : "DEV"}
            </div>
            <button
              onClick={() => onSetTheme(isDark ? "light" : "dark")}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </motion.aside>
  );
}

function ConversationItem({
  conv,
  isActive,
  isCollapsed,
  onSelect,
  onDelete,
  onTogglePin,
  isRenaming,
  renameText,
  setRenameText,
  startRename,
  finishRename,
}: {
  conv: Conversation & { messageCount: number };
  isActive: boolean;
  isCollapsed: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onRename: (t: string) => void;
  isRenaming: boolean;
  renameText: string;
  setRenameText: (t: string) => void;
  startRename: () => void;
  finishRename: () => void;
}) {
  if (isCollapsed) {
    return (
      <button
        onClick={onSelect}
        title={conv.title}
        className={`w-full flex items-center justify-center h-8 rounded-lg transition-colors cursor-pointer ${
          isActive
            ? "bg-[var(--active-overlay)] text-[var(--text-primary)] font-semibold"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)]"
        }`}
      >
        <MessageSquare className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div
      onClick={onSelect}
      className={`group w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
        isActive
          ? "bg-[var(--active-overlay)] text-[var(--text-primary)] font-medium"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)]"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 pr-1 flex-1">
        <MessageSquare className="w-3.5 h-3.5 text-[var(--lime-text)] shrink-0" />
        {isRenaming ? (
          <input
            autoFocus
            type="text"
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => e.key === "Enter" && finishRename()}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-[var(--bg-app)] border border-[var(--lime)] rounded px-1 text-xs text-[var(--text-primary)] outline-none"
          />
        ) : (
          <span className="truncate">{conv.title}</span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {conv.pinned && <Pin className="w-2.5 h-2.5 text-amber-400 shrink-0" />}

        {conv.messageCount > 0 && !isRenaming && (
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            {conv.messageCount}
          </span>
        )}

        {/* Dropdown Menu */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/20 text-neutral-400 hover:text-white transition-opacity cursor-pointer"
            >
              <MoreVertical className="w-3 h-3" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="w-36 bg-white dark:bg-[#202721] text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-white/10 rounded-xl p-1 shadow-xl dark:shadow-2xl z-50 text-xs focus:outline-none"
            >
              <DropdownMenu.Item
                onSelect={startRename}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer outline-none"
              >
                <Edit2 className="w-3 h-3" />
                <span>Rename</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={onTogglePin}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer outline-none"
              >
                <Pin className="w-3 h-3" />
                <span>{conv.pinned ? "Unpin" : "Pin"}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-neutral-200 dark:bg-white/5 my-0.5" />
              <DropdownMenu.Item
                onSelect={onDelete}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer outline-none"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}
