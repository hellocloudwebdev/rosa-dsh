import { useState } from "react";
import { Send, Mail, Users } from "lucide-react";
import { AceMoonIcon } from "./icons/AceMoonIcon";

interface StudioHeaderProps {
  campaignTitle: string;
  onChangeTitle: (title: string) => void;
  onSendTest: () => void;
  onDeploy: () => void;
}

export function StudioHeader({
  campaignTitle,
  onChangeTitle,
  onSendTest,
  onDeploy,
}: StudioHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);

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

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0">
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
      </div>
    </header>
  );
}
