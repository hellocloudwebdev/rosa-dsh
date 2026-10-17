import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, MessageSquare, Brain, Code, Scale } from "lucide-react";

export type Mode = "Chat" | "Reasoning" | "Code" | "Compare";

interface ModeConfig {
  id: Mode;
  label: string;
  desc: string;
  icon: typeof MessageSquare;
}

const MODES: ModeConfig[] = [
  { id: "Chat", label: "General Chat", desc: "Balanced conversation & creative ideation", icon: MessageSquare },
  { id: "Reasoning", label: "Deep Reasoning", desc: "Step-by-step analytical reasoning", icon: Brain },
  { id: "Code", label: "Coding & Tech", desc: "Precise code generation and debugging", icon: Code },
  { id: "Compare", label: "Multi-Model Compare", desc: "Run side-by-side model showdowns", icon: Scale },
];

interface ModeMenuProps {
  mode: Mode;
  onChange: (m: Mode) => void;
  variant?: "dark" | "light";
}

export function ModeMenu({ mode, onChange, variant = "dark" }: ModeMenuProps) {
  const isLight = variant === "light";
  const active = MODES.find((m) => m.id === mode) || MODES[0]!;
  const Icon = active.icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium cursor-pointer outline-none transition-colors border ${
            isLight
              ? "bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-800"
              : "bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] border-[var(--border-strong)] text-[var(--text-primary)]"
          }`}
        >
          <Icon className="w-3.5 h-3.5 text-[var(--lime-text)]" />
          <span>{active.label}</span>
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className={`w-[220px] rounded-xl p-1.5 z-50 border shadow-2xl focus:outline-none ${
            isLight
              ? "bg-white border-neutral-200 text-neutral-900"
              : "bg-[#242b25] border-white/10 text-neutral-100"
          }`}
        >
          {MODES.map((m) => {
            const MIcon = m.icon;
            const isSelected = m.id === mode;
            return (
              <DropdownMenu.Item
                key={m.id}
                onSelect={() => onChange(m.id)}
                className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer outline-none transition-colors ${
                  isSelected
                    ? isLight
                      ? "bg-neutral-100 font-medium text-neutral-900"
                      : "bg-white/10 font-medium text-white"
                    : isLight
                      ? "text-neutral-700 hover:bg-neutral-50"
                      : "text-neutral-300 hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <MIcon className="w-3.5 h-3.5 text-[var(--lime-text)]" />
                  <div>
                    <div className="font-medium">{m.label}</div>
                    <div className="text-[10px] text-neutral-400">{m.desc}</div>
                  </div>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
