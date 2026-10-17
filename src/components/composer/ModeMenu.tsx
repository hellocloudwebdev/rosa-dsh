import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";

export type Mode = "Plan" | "Ask" | "Build";

const MODES: Mode[] = ["Plan", "Ask", "Build"];

interface ModeMenuProps {
  mode: Mode;
  onChange: (m: Mode) => void;
  variant?: "dark" | "light";
}

export function ModeMenu({ mode, onChange, variant = "dark" }: ModeMenuProps) {
  const isLight = variant === "light";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <motion.button
          layout
          className={`flex items-center gap-1 h-8 px-2.5 rounded-lg text-sm cursor-pointer outline-none transition-colors ${
            isLight
              ? "bg-[#f2f2f0] hover:bg-[#e7e7e4] text-neutral-800"
              : "bg-[#2e372f] hover:bg-[#39443b] text-neutral-100"
          }`}
        >
          {mode}
          <ChevronDown className={`w-3.5 h-3.5 ${isLight ? "text-neutral-500" : "text-neutral-400"}`} />
        </motion.button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className={`min-w-[150px] rounded-xl p-1.5 z-50 focus:outline-none ${
            isLight
              ? "bg-white shadow-xl border border-neutral-200"
              : "bg-[#262e28] shadow-2xl border border-white/5"
          }`}
        >
          {MODES.map((m) => (
            <DropdownMenu.Item
              key={m}
              onSelect={() => onChange(m)}
              className={`flex items-center justify-between px-2.5 h-8 rounded-lg text-sm outline-none cursor-pointer ${
                isLight
                  ? "text-neutral-800 data-[highlighted]:bg-neutral-100"
                  : "text-neutral-100 data-[highlighted]:bg-white/5"
              }`}
            >
              {m}
              {m === mode && <Check className={`w-4 h-4 ${isLight ? "text-neutral-600" : "text-neutral-200"}`} />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
