import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, MessageSquare, Brain, Code } from "lucide-react";
import { motion } from "framer-motion";

export type Mode = "Ask" | "Plan" | "Build";

interface ModeConfig {
  id: Mode;
  label: string;
  desc: string;
  icon: typeof MessageSquare;
}

const MODES: ModeConfig[] = [
  { id: "Plan", label: "Plan", desc: "Plan, reason & break down tasks", icon: Brain },
  { id: "Ask", label: "Ask", desc: "Quick Q&A, chat & explore concepts", icon: MessageSquare },
  { id: "Build", label: "Build", desc: "Code generation, build & implementation", icon: Code },
];

interface ModeMenuProps {
  mode: Mode;
  onChange: (m: Mode) => void;
  variant?: "dark" | "light";
}

export function ModeMenu({ mode, onChange }: ModeMenuProps) {
  const active = MODES.find((m) => m.id === mode) || MODES[0]!;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <motion.button
          whileTap={{ scale: 0.96 }}
          type="button"
          className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium cursor-pointer outline-none transition-all border bg-neutral-100/90 dark:bg-white/10 hover:bg-neutral-200/80 dark:hover:bg-white/15 border-neutral-200/80 dark:border-white/10 text-neutral-800 dark:text-neutral-100 shadow-2xs"
        >
          <span>{active.label}</span>
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </motion.button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="w-44 rounded-2xl p-1.5 z-50 border shadow-2xl bg-white/95 dark:bg-[#1e1f23]/95 backdrop-blur-md border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-neutral-100 focus:outline-none animate-in fade-in-50 zoom-in-95 duration-100"
        >
          {MODES.map((m) => {
            const isSelected = m.id === mode;
            return (
              <DropdownMenu.Item
                key={m.id}
                onSelect={() => onChange(m.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer outline-none transition-colors ${
                  isSelected
                    ? "bg-neutral-100 dark:bg-white/10 font-semibold text-neutral-900 dark:text-white"
                    : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white font-normal"
                }`}
              >
                <span>{m.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white stroke-[2.5]" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
