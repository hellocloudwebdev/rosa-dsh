import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Plus,
  RotateCcw,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AcmeLogo } from "./icons/AcmeLogo";
import { AceMoonIcon } from "./icons/AceMoonIcon";
import {
  TemplatesIcon,
  MyBrandsIcon,
  BrandImagesIcon,
  CampaignsIcon,
  AudienceIcon,
  SendingDomainsIcon,
  SendingActivityIcon,
} from "./icons/SidebarIcons";
import type { NavItemId } from "../types";

export type Theme = "dark" | "light";

interface SidebarProps {
  activeItem: NavItemId;
  onSelectItem: (id: NavItemId) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenNewEmailModal: () => void;
  onOpenTemplatesModal: () => void;
  onOpenBrandsModal: () => void;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  /** Expanded width in px (draggable, 240–420, default 300) */
  width: number;
  onWidthChange: (w: number) => void;
}

export const SIDEBAR_MIN = 240;
export const SIDEBAR_MAX = 420;

const WORKSPACES = [
  { id: "ace-2", name: "Ace Studio 2.0" },
  { id: "marketing", name: "Acme Marketing Pro" },
  { id: "transactional", name: "Acme Transactional" },
];

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}

function NavButton({ active, onClick, icon, label, collapsed }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-3 h-9 rounded-lg text-sm transition-colors cursor-pointer outline-none ${
        active
          ? "bg-[var(--active-overlay)] text-[var(--text-primary)] font-medium"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)]"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

function ThemeToggle({
  theme,
  onSetTheme,
  collapsed,
}: {
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  collapsed: boolean;
}) {
  const isDark = theme === "dark";

  if (collapsed) {
    // Single icon button — icon spins to the theme you'll switch to
    return (
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={() => onSetTheme(isDark ? "light" : "dark")}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        aria-label="Toggle theme"
        className="w-8 h-8 rounded-lg bg-[var(--bg-panel-2)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -120, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 120, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    );
  }

  // Sliding-knob switch: Sun on the light side, Moon on the dark side
  return (
    <button
      onClick={() => onSetTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className={`relative flex items-center w-[54px] h-7 rounded-full px-1 border shrink-0 transition-colors cursor-pointer ${
        isDark
          ? "bg-[#262e28] border-white/10"
          : "bg-[#ececea] border-black/10"
      }`}
    >
      <Sun
        className={`absolute left-[7px] w-3.5 h-3.5 transition-colors duration-300 ${
          !isDark ? "text-amber-500" : "text-[var(--text-muted)]"
        }`}
      />
      <Moon
        className={`absolute right-[7px] w-3.5 h-3.5 transition-colors duration-300 ${
          isDark ? "text-[var(--lime-text)]" : "text-[var(--text-muted)]"
        }`}
      />
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`w-5 h-5 rounded-full shadow-md ${
          isDark ? "ml-auto bg-[#4a4c52]" : "mr-auto bg-white"
        }`}
      />
    </button>
  );
}

export function Sidebar({
  activeItem,
  onSelectItem,
  isCollapsed,
  onToggleCollapse,
  onOpenNewEmailModal,
  onOpenTemplatesModal,
  onOpenBrandsModal,
  theme,
  onSetTheme,
  width,
  onWidthChange,
}: SidebarProps) {
  const [workspace, setWorkspace] = useState("Ace Studio 2.0");

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

  const handleSelect = (id: NavItemId) => {
    onSelectItem(id);
    if (id === "new-email") onOpenNewEmailModal();
    else if (id === "templates") onOpenTemplatesModal();
    else if (id === "my-brands") onOpenBrandsModal();
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
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden p-3.5 pt-5">
        {/* Brand header */}
        <div className="flex items-center justify-between mb-5 px-1 min-h-[32px]">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <AcmeLogo className="w-5 h-5 text-[var(--text-primary)] shrink-0" />
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.15 }}
                  className="font-semibold text-[17px] text-[var(--text-primary)] tracking-tight whitespace-nowrap"
                >
                  Acme AI
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

        {/* Workspace selector */}
        <div className="mb-5 px-0.5">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className={`w-full flex items-center justify-between border border-[var(--border-strong)] rounded-xl px-3 h-10 bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer outline-none ${
                  isCollapsed ? "justify-center px-0" : ""
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <AceMoonIcon className="w-4 h-4 shrink-0" />
                  {!isCollapsed && (
                    <span className="text-sm font-medium text-[var(--text-primary)] tracking-tight truncate">
                      {workspace}
                    </span>
                  )}
                </div>
                {!isCollapsed && (
                  <ChevronsUpDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={6}
                className="w-56 bg-[#262e28] rounded-xl p-1.5 border border-white/5 shadow-2xl z-50 focus:outline-none"
              >
                <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Switch Workspace
                </div>
                {WORKSPACES.map((ws) => (
                  <DropdownMenu.Item
                    key={ws.id}
                    onSelect={() => setWorkspace(ws.name)}
                    className={`flex items-center justify-between px-2.5 py-2 text-sm rounded-lg cursor-pointer outline-none transition-colors ${
                      workspace === ws.name
                        ? "bg-white/10 text-white font-medium"
                        : "text-neutral-300 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AceMoonIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{ws.name}</span>
                    </div>
                    {workspace === ws.name && <Check className="w-3.5 h-3.5 text-neutral-200" />}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator className="h-px bg-white/5 my-1" />
                <div className="px-2.5 py-1 text-xs text-neutral-500">Ace Engine v2.4.0 (active)</div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        {/* Create section */}
        {!isCollapsed && (
          <h3 className="text-xs font-medium text-[var(--text-muted)] px-3 py-1.5">Create</h3>
        )}
        <nav className="space-y-1">
          <NavButton
            active={activeItem === "new-email"}
            onClick={() => handleSelect("new-email")}
            icon={<Plus className="w-4 h-4" strokeWidth={2.2} />}
            label="New Email"
            collapsed={isCollapsed}
          />
          <NavButton
            active={activeItem === "templates"}
            onClick={() => handleSelect("templates")}
            icon={<TemplatesIcon className="w-4 h-4" />}
            label="Templates"
            collapsed={isCollapsed}
          />
          <NavButton
            active={activeItem === "my-brands"}
            onClick={() => handleSelect("my-brands")}
            icon={<MyBrandsIcon className="w-4 h-4" />}
            label="My Brands"
            collapsed={isCollapsed}
          />
          <NavButton
            active={activeItem === "brand-images"}
            onClick={() => handleSelect("brand-images")}
            icon={<BrandImagesIcon className="w-4 h-4" />}
            label="Brand Images"
            collapsed={isCollapsed}
          />
        </nav>

        {/* Operations section */}
        {!isCollapsed && (
          <h3 className="text-xs font-medium text-[var(--text-muted)] px-3 pt-5 pb-1.5">Operations</h3>
        )}
        {isCollapsed && <div className="h-4" />}
        <nav className="space-y-1">
          <NavButton
            active={activeItem === "campaigns"}
            onClick={() => handleSelect("campaigns")}
            icon={<CampaignsIcon className="w-4 h-4" />}
            label="Campaigns"
            collapsed={isCollapsed}
          />
          <NavButton
            active={activeItem === "audience"}
            onClick={() => handleSelect("audience")}
            icon={<AudienceIcon className="w-4 h-4" />}
            label="Audience"
            collapsed={isCollapsed}
          />
          <NavButton
            active={activeItem === "sending-domains"}
            onClick={() => handleSelect("sending-domains")}
            icon={<SendingDomainsIcon className="w-4 h-4" />}
            label="Sending Domains"
            collapsed={isCollapsed}
          />
          <NavButton
            active={activeItem === "sending-activity"}
            onClick={() => handleSelect("sending-activity")}
            icon={<SendingActivityIcon className="w-4 h-4" />}
            label="Sending Activity"
            collapsed={isCollapsed}
          />
          <NavButton
            active={activeItem === "history"}
            onClick={() => handleSelect("history")}
            icon={<RotateCcw className="w-4 h-4" />}
            label="History"
            collapsed={isCollapsed}
          />
        </nav>
      </div>

      {/* Resize handle (drag to resize, 240–420) */}
      {!isCollapsed && (
        <div
          onPointerDown={handleResizeStart}
          className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-[var(--lime)]/60 transition-colors z-30"
          title="Drag to resize sidebar"
        />
      )}

      {/* Footer: Acme Admin profile + light/dark toggle */}
      <div className="p-3 border-t border-[var(--border-subtle)] transition-colors">
        {!isCollapsed ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2.5 flex-1 min-w-0 px-2 py-1.5 rounded-lg hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-neutral-600 to-neutral-900 border border-white/10 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                AC
              </div>
              <div className="flex flex-col overflow-hidden min-w-0">
                <span className="text-xs font-medium text-[var(--text-primary)] truncate">Acme Admin</span>
                <span className="text-[11px] text-[var(--text-muted)] truncate">team@acme.ai</span>
              </div>
            </div>
            <ThemeToggle theme={theme} onSetTheme={onSetTheme} collapsed={false} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-neutral-600 to-neutral-900 border border-white/10 text-white flex items-center justify-center text-xs font-semibold shrink-0 cursor-pointer">
              AC
            </div>
            <ThemeToggle theme={theme} onSetTheme={onSetTheme} collapsed={true} />
          </div>
        )}
      </div>
    </motion.aside>
  );
}
