import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronsRight, Search } from "lucide-react";
import { motion } from "framer-motion";
import { ModelIcon } from "./icons";

export interface ModelSel {
  id: string;
  name: string;
  effort: string;
  icon: "kimi" | "gpt" | "star";
}

const MODELS: ModelSel[] = [
  { id: "kimi-k3", name: "Kimi K3", effort: "High", icon: "kimi" },
  { id: "gpt-terra", name: "GPT-5.6 Terra", effort: "Medium", icon: "gpt" },
  { id: "gpt-sol", name: "GPT-5.6 Sol", effort: "Medium", icon: "gpt" },
  { id: "sonnet-5", name: "Sonnet 5", effort: "High", icon: "star" },
  { id: "opus-4-8", name: "Opus 4.8", effort: "High", icon: "star" },
  { id: "fable-5", name: "Fable 5", effort: "High", icon: "star" },
];

const EFFORTS = ["Low", "Medium", "High", "Max"];

function Toggle({
  on,
  onClick,
  small = false,
  light = false,
}: {
  on: boolean;
  onClick: () => void;
  small?: boolean;
  light?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`relative shrink-0 rounded-full transition-colors duration-200 cursor-pointer ${
        small ? "w-8 h-[18px]" : "w-9 h-5"
      } ${on ? "bg-[#3f7fe8]" : light ? "bg-[#d4d4d0]" : "bg-[#47524a]"}`}
    >
      <motion.span
        animate={{ x: on ? (small ? 14 : 16) : 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={`absolute left-[2px] top-[2px] rounded-full bg-white shadow ${
          small ? "w-[14px] h-[14px]" : "w-4 h-4"
        }`}
      />
    </button>
  );
}

interface ModelMenuProps {
  model: ModelSel;
  onModelChange: (m: ModelSel) => void;
  auto: boolean;
  onAutoChange: (v: boolean) => void;
  variant?: "dark" | "light";
}

export function ModelMenu({ model, onModelChange, auto, onAutoChange, variant = "dark" }: ModelMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);

  const isLight = variant === "light";

  const filtered = MODELS.filter((m) =>
    m.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const select = (m: ModelSel) => {
    onModelChange(m);
    setOpen(false);
  };

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQuery("");
          setHovered(null);
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        <motion.button
          layout
          className={
            isLight
              ? "flex items-center gap-1.5 h-8 px-2 rounded-lg hover:bg-black/5 text-sm text-neutral-900 cursor-pointer outline-none transition-colors"
              : "flex items-center gap-1.5 h-8 px-2 rounded-lg hover:bg-white/5 text-sm text-neutral-100 cursor-pointer outline-none transition-colors"
          }
        >
          {auto ? (
            <>
              <span className={isLight ? "text-neutral-900" : "text-neutral-100"}>Auto</span>
              <Toggle on small light={isLight} onClick={() => onAutoChange(false)} />
            </>
          ) : (
            <>
              <ModelIcon type={model.icon} className="w-4 h-4" />
              <span className={isLight ? "text-neutral-900" : "text-neutral-100"}>
                {model.name}{" "}
                <span className={isLight ? "text-neutral-500" : "text-neutral-400"}>{model.effort}</span>
              </span>
            </>
          )}
          <ChevronDown className={`w-3.5 h-3.5 ${isLight ? "text-neutral-500" : "text-neutral-400"}`} />
        </motion.button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className={`w-[252px] rounded-xl p-1.5 z-50 ${
            isLight
              ? "bg-white shadow-xl border border-neutral-200"
              : "bg-[#262e28] shadow-2xl border border-white/5"
          }`}
        >
          {/* Search */}
          <div
            className={`flex items-center gap-2 rounded-lg px-2.5 h-8 mb-1 ${
              isLight ? "bg-neutral-100" : "bg-[#2f382f]"
            }`}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models"
              className={`w-full bg-transparent outline-none text-sm ${
                isLight
                  ? "text-neutral-900 placeholder:text-neutral-400"
                  : "text-neutral-100 placeholder:text-neutral-500"
              }`}
            />
          </div>

          {/* Auto row */}
          <div
            onClick={() => onAutoChange(!auto)}
            className={`flex items-center justify-between px-2.5 h-9 rounded-lg cursor-pointer transition-colors ${
              isLight ? "hover:bg-neutral-100" : "hover:bg-white/5"
            }`}
          >
            <span className={`text-sm ${isLight ? "text-neutral-900" : "text-neutral-100"}`}>Auto</span>
            <Toggle on={auto} light={isLight} onClick={() => onAutoChange(!auto)} />
          </div>

          {/* Model list */}
          {filtered.map((m) => (
            <div
              key={m.id}
              className="relative"
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                onClick={() => select(m)}
                className={`flex items-center justify-between px-2.5 h-9 rounded-lg cursor-pointer transition-colors ${
                  isLight ? "hover:bg-neutral-100" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ModelIcon type={m.icon} className="w-4 h-4 shrink-0" />
                  <span className={`text-sm truncate ${isLight ? "text-neutral-800" : "text-neutral-100"}`}>
                    {m.name}{" "}
                    <span className={isLight ? "text-neutral-500" : "text-neutral-400"}>{m.effort}</span>
                  </span>
                </div>
                {m.id === model.id && (
                  <Check className={`w-4 h-4 shrink-0 ${isLight ? "text-neutral-600" : "text-neutral-200"}`} />
                )}
              </div>

              {/* Effort hover submenu */}
              {hovered === m.id && (
                <div
                  className={`absolute left-full top-0 ml-2 w-[132px] rounded-xl p-1.5 z-50 ${
                    isLight
                      ? "bg-white shadow-xl border border-neutral-200"
                      : "bg-[#29322b] shadow-2xl border border-white/5"
                  }`}
                >
                  <div className={`px-2.5 pt-1 pb-1 text-xs ${isLight ? "text-neutral-500" : "text-neutral-400"}`}>
                    Effort
                  </div>
                  {EFFORTS.map((e) => (
                    <DropdownMenu.Item
                      key={e}
                      onSelect={() => select({ ...m, effort: e })}
                      className={`flex items-center gap-2 px-2.5 pr-7 h-8 rounded-lg text-sm outline-none cursor-pointer ${
                        isLight
                          ? "text-neutral-800 data-[highlighted]:bg-neutral-100"
                          : "text-neutral-100 data-[highlighted]:bg-white/5"
                      }`}
                    >
                      {e}
                      {m.id === model.id && e === model.effort && (
                        <Check className={`w-3.5 h-3.5 ${isLight ? "text-neutral-600" : "text-neutral-300"}`} />
                      )}
                    </DropdownMenu.Item>
                  ))}
                  <ChevronsRight
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
                      isLight ? "text-neutral-400" : "text-neutral-500"
                    }`}
                  />
                </div>
              )}
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
