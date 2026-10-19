import { motion } from "framer-motion";
import { X } from "lucide-react";

interface UpgradeBannerProps {
  onDismiss: () => void;
  onUpgrade?: () => void;
}

/** Identical dark-green gradient banner matching reference design. */
export function UpgradeBanner({ onDismiss, onUpgrade }: UpgradeBannerProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="relative mt-2 h-11 rounded-xl overflow-hidden flex items-center justify-between px-3.5 shadow-xs shrink-0"
      style={{
        background:
          "linear-gradient(90deg, #1d221e 0%, #1f2823 38%, #2f4d3b 70%, #4f7f61 100%)",
      }}
    >
      {/* Glow accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(70% 170% at 78% 50%, rgba(140, 214, 165, 0.35), transparent 65%)",
        }}
      />

      <div className="relative flex items-center gap-1.5 text-sm">
        <span className="font-semibold text-white">Upgrade to Pro.</span>
        <button
          type="button"
          onClick={onUpgrade}
          className="text-[#8fb1ff] hover:underline cursor-pointer"
        >
          See Pro benefits
        </button>
      </div>

      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={onUpgrade}
          className="h-7 px-3.5 rounded-full text-xs font-semibold bg-[#d6ded6] hover:bg-white text-[#16241b] transition-colors cursor-pointer"
        >
          Upgrade
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="w-6 h-6 rounded-md flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
