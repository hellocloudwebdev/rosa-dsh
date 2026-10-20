import { useMemo } from "react";
import { CheckmarkIcon } from "./glyphs";

export type Mode = "Ask" | "Plan" | "Build";

export const ALL_MODES: readonly Mode[] = ["Plan", "Ask", "Build"];

interface ModeMenuProps {
  mode: Mode;
  onChange: (m: Mode) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mode selector pill. The active mode is always ordered last in the list and
 * carries a checkmark, so the menu never reorders under the pointer.
 */
export function ModeMenu({ mode, onChange, open, onOpenChange }: ModeMenuProps) {
  const orderedModes = useMemo(() => {
    const inactive = ALL_MODES.filter((m) => m !== mode);
    return [...inactive, mode];
  }, [mode]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`pill-control mode-btn ${open ? "menu-open" : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="mode-btn-text transition-colors">{mode}</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          className="mt-0.5"
          style={{ color: "var(--chevron-color)" }}
          aria-hidden="true"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        className={`glass-popover ${open ? "popover-visible" : "popover-hidden"} absolute left-0 bottom-0 w-[148px] rounded-[18px] p-1.5 z-30`}
        role="menu"
      >
        <div className="flex flex-col gap-0.5">
          {orderedModes.map((option) => {
            const isSelected = option === mode;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => {
                  onChange(option);
                  onOpenChange(false);
                }}
                className="mode-menu-item"
              >
                <span>{option}</span>
                {isSelected && <CheckmarkIcon />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
