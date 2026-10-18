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

export function ModeMenu({ mode, onChange }: ModeMenuProps) {
  const active = MODES.find((m) => m.id === mode) || MODES[0]!;
  const Icon = active.icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium cursor-pointer outline-none transition-colors border bg-white dark:bg-[#283129] hover:bg-neutral-50 dark:hover:bg-[#323d33] border-neutral-200 dark:border-white/10 text-neutral-800 dark:text-neutral-100"
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
          className="w-[220px] rounded-xl p-1.5 z-50 border shadow-xl dark:shadow-2xl bg-white dark:bg-[#202721] border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-neutral-100 focus:outline-none"
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
                    ? "bg-neutral-100 dark:bg-white/10 font-semibold text-neutral-900 dark:text-white"
                    : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <MIcon className="w-3.5 h-3.5 text-[var(--lime-text)]" />
                  <div>
                    <div className="font-medium">{m.label}</div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{m.desc}</div>
                  </div>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
