import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, MessageSquare, Brain, Code } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
          layout
          whileTap={{ scale: 0.94 }}
          type="button"
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="flex items-center justify-between gap-2 h-8.5 px-4 min-w-[88px] sm:min-w-[96px] rounded-full text-xs font-semibold cursor-pointer outline-none transition-colors border bg-[#f2f2f0] dark:bg-[#242b25] hover:bg-[#e7e7e4] dark:hover:bg-[#2e372f] border-neutral-200/70 dark:border-white/10 text-neutral-800 dark:text-neutral-100 shadow-2xs select-none"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={active.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="text-left"
            >
              {active.label}
            </motion.span>
          </AnimatePresence>
          <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
        </motion.button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          asChild
          side="top"
          align="start"
          sideOffset={10}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ type: "spring", stiffness: 450, damping: 28 }}
            className="w-40 rounded-[20px] p-1.5 z-50 border shadow-[0_16px_40px_rgba(0,0,0,0.3)] bg-white/95 dark:bg-[#242528]/95 backdrop-blur-2xl border-neutral-200/80 dark:border-white/10 text-neutral-900 dark:text-neutral-100 focus:outline-none"
          >
            {MODES.map((m) => {
              const isSelected = m.id === mode;
              return (
                <DropdownMenu.Item
                  key={m.id}
                  onSelect={() => onChange(m.id)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs cursor-pointer outline-none transition-all ${
                    isSelected
                      ? "bg-neutral-100 dark:bg-white/10 font-semibold text-neutral-900 dark:text-white"
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white font-medium"
                  }`}
                >
                  <span>{m.label}</span>
                  {isSelected && (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    >
                      <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white stroke-[2.5]" />
                    </motion.span>
                  )}
                </DropdownMenu.Item>
              );
            })}
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
