import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface HoverExpandProps {
  icon: ReactNode;
  label: string;
  ariaLabel: string;
  onClick?: () => void;
  variant?: "dark" | "light";
}

/** Circular icon button that morphs into a pill with a label on hover. */
export function HoverExpand({ icon, label, ariaLabel, onClick, variant = "dark" }: HoverExpandProps) {
  const [hover, setHover] = useState(false);

  return (
    <motion.button
      layout
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`flex items-center h-8.5 rounded-full px-2.5 cursor-pointer outline-none transition-all border ${
        variant === "light"
          ? "bg-[#f2f2f0] hover:bg-[#e7e7e4] text-neutral-800 border-neutral-200/70"
          : "bg-[#242b25] hover:bg-[#2e372f] text-neutral-100 border-white/5"
      }`}
    >
      {icon}
      <AnimatePresence initial={false}>
        {hover && (
          <motion.span
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden whitespace-nowrap text-sm pl-1.5 pr-0.5"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
