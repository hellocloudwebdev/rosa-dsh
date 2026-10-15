import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Renders a separator below this item. */
  separate?: boolean;
  /** Non-selectable section heading. */
  heading?: string;
}

export interface DropdownMenuProps {
  trigger: (props: {
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu";
    id: string;
  }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
  /** Accessible name announced with the menu. */
  label?: string;
}

/**
 * Lightweight dropdown. Keyboard: Escape or outside-click closes; arrow keys
 * move focus; Enter activates. Deliberately dependency-free so the whole menu
 * behaviour is auditable in one file.
 */
export function DropdownMenu({ trigger, items, align = "end", className, label }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const menuId = `${triggerId}-menu`;

  const selectable = items.filter((item) => !item.heading);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      wrapperRef.current?.querySelector<HTMLElement>("[data-menu-trigger]")?.focus();
      return;
    }
    if (!selectable.length) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const dir = event.key === "ArrowDown" ? 1 : -1;
      const current = selectable.findIndex((_, i) => i === activeIndex);
      setActiveIndex((current + dir + selectable.length) % selectable.length);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : selectable.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (activeIndex >= 0) {
        event.preventDefault();
        const item = selectable[activeIndex];
        if (item && !item.disabled) {
          item.onSelect();
          setOpen(false);
        }
      }
    }
  };

  // Keep the focused row in view when navigating by keyboard.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      {trigger({
        onClick: () => setOpen((v) => !v),
        "aria-expanded": open,
        "aria-haspopup": "menu",
        id: triggerId,
      })}

      {open ? (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute top-[calc(100%+4px)] z-50 min-w-[210px] max-w-[320px] overflow-y-auto",
            "rounded-lg border border-line-subtle bg-surface-overlay p-1",
            "shadow-xl shadow-ink-strong/10",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, index) => {
            if (item.heading) {
              return (
                <div
                  key={item.id}
                  className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint"
                >
                  {item.heading}
                </div>
              );
            }
            const isActive = activeIndex === index;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  role="menuitem"
                  data-index={index}
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left",
                    "text-[13px] text-ink-strong transition-colors",
                    item.disabled && "cursor-not-allowed opacity-45",
                    !item.disabled && (isActive ? "bg-surface-sunken" : "hover:bg-surface-sunken"),
                    item.destructive && "text-state-danger-strong",
                  )}
                >
                  {item.icon ? (
                    <span className="shrink-0 text-ink-faint" aria-hidden="true">
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint ? (
                    <span className="shrink-0 text-[11px] text-ink-faint">{item.hint}</span>
                  ) : null}
                </button>
                {item.separate ? <div className="my-1 h-px bg-line-subtle" /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Attach to the element that should open a DropdownMenu on click. */
export function menuTriggerProps(id: string) {
  return { "data-menu-trigger": id } as const;
}
