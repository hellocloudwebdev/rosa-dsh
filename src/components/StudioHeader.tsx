import { useState } from "react";
import { Send, Mail, Users, PanelRight, ChevronDown, Check } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { SignInButton, UserButton, useAuth } from "@clerk/react";
import { AceMoonIcon } from "./icons/AceMoonIcon";
import { VIEW_LIST } from "./view/views";
import type { ViewType } from "../types";

interface StudioHeaderProps {
  campaignTitle: string;
  onChangeTitle: (title: string) => void;
  onSendTest: () => void;
  onDeploy: () => void;
  /** Currently open View type (null = no View open) */
  viewType: ViewType | null;
  onOpenView: (t: ViewType) => void;
}

export function StudioHeader({
  campaignTitle,
  onChangeTitle,
  onSendTest,
  onDeploy,
  viewType,
  onOpenView,
}: StudioHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const { isSignedIn } = useAuth();

  return (
    <header className="border-b border-[var(--border-subtle)] px-5 py-2.5 flex items-center justify-between bg-[var(--bg-panel)] shrink-0 z-20 transition-colors">
      {/* Left: breadcrumbs + title */}
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-muted)] shrink-0">
          <span className="hover:text-[var(--text-secondary)] cursor-pointer">Acme AI</span>
          <span>/</span>
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-medium">
            <AceMoonIcon className="w-3 h-3" />
            Ace Studio
          </span>
          <span>/</span>
        </div>

        {isEditingTitle ? (
          <input
            type="text"
            value={campaignTitle}
            onChange={(e) => onChangeTitle(e.target.value)}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
            autoFocus
            className="text-sm font-semibold text-[var(--text-primary)] bg-[var(--active-overlay)] px-2 py-0.5 rounded outline-none w-64"
          />
        ) : (
          <h2
            onClick={() => setIsEditingTitle(true)}
            className="text-sm font-semibold text-[var(--text-primary)] tracking-tight cursor-pointer hover:bg-[var(--hover-overlay)] px-1.5 py-0.5 rounded transition-colors truncate"
            title="Click to edit campaign name"
          >
            {campaignTitle}
          </h2>
        )}

        <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--chip-bg)] text-[var(--text-secondary)] text-xs font-medium shrink-0">
          <Users className="w-3 h-3" />
          <span>48.2k Subscribers</span>
        </div>

        <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-white px-2 py-0.5 rounded-full shrink-0 bg-[#558766]">
          <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse" />
          <span>Draft Synced</span>
        </div>
      </div>

      {/* Right: View launcher + actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Open / switch the contextual View panel */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors cursor-pointer ${
                viewType
                  ? "border-[var(--lime)]/60 bg-[var(--lime)]/15 text-[var(--lime-text)]"
                  : "border-[var(--border-strong)] bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <PanelRight className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {viewType ? (VIEW_LIST.find((v) => v.type === viewType)?.label ?? "View") : "Open View"}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="w-52 bg-[#262e28] rounded-xl p-1.5 border border-white/5 shadow-2xl z-50 focus:outline-none"
            >
              <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Open a View
              </div>
              {VIEW_LIST.map((v) => (
                <DropdownMenu.Item
                  key={v.type}
                  onSelect={() => onOpenView(v.type)}
                  className={`flex items-center justify-between px-2.5 py-2 text-sm rounded-lg cursor-pointer outline-none transition-colors ${
                    viewType === v.type
                      ? "bg-white/10 text-white font-medium"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-[var(--lime-text)]">{v.icon}</span>
                    {v.label}
                  </span>
                  {viewType === v.type && <Check className="w-3.5 h-3.5 text-neutral-200" />}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          onClick={onSendTest}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border-strong)] bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="hidden sm:inline">Send Test</span>
        </button>

        <button
          onClick={onDeploy}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[var(--lime)] text-white hover:opacity-90 rounded-lg transition-all cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Deploy Campaign</span>
        </button>

        <div className="flex items-center ml-2 border-l border-[var(--border-subtle)] pl-2">
          {!isSignedIn ? (
            <SignInButton mode="modal">
              <button className="px-3 py-1.5 text-xs font-semibold border border-[var(--border-strong)] rounded-lg hover:bg-[var(--hover-overlay)] text-[var(--text-primary)] transition-colors cursor-pointer">
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
