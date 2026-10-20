import { motion } from "framer-motion";
import { X } from "lucide-react";
import "./composer.css";

interface UpgradeBannerProps {
  onDismiss: () => void;
  onUpgrade?: () => void;
  theme: "dark" | "light";
}

/**
 * Pro upgrade banner sitting under the composer: gradient wash plus a masked
 * border that brightens toward the right edge.
 */
export function UpgradeBanner({ onDismiss, onUpgrade, theme }: UpgradeBannerProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rosa-chat-theme w-full"
      data-theme={theme}
    >
      <div className="pro-banner">
        <div className="relative z-10 flex items-center gap-1.5 text-[15px] tracking-[-0.011em]">
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Upgrade to Pro.
          </span>
          <button type="button" onClick={onUpgrade} className="pro-link text-[15px]">
            See Pro benefits
          </button>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <button type="button" onClick={onUpgrade} className="upgrade-pill-btn">
            Upgrade
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ color: "var(--dismiss-color)" }}
          >
            <X className="w-4 h-4" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
