import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelWithProvider } from "@shared/types.js";
import { CheckmarkIcon, ProviderBadge } from "./glyphs";
import {
  DEFAULT_EFFORT,
  EFFORT_LEVELS,
  modelKey,
  type EffortLevel,
} from "./effort";

type ModelFilterTab = "fav" | "all";

/** The catalogue shows at most nine rows, and never fewer than three. */
const MAX_ROWS = 9;
const MIN_ROWS = 3;
/** Fallback chrome height (search, Auto row, filter bar, footer, padding). */
const DEFAULT_CHROME_PX = 149;
/** Panel width before the first measurement; the effort flyout starts here. */
const NOMINAL_PANEL_WIDTH = 380;
/** Width of the effort flyout, used to keep it on screen. */
const EFFORT_FLYOUT_WIDTH = 148;

export interface ModelSelection {
  providerId: string;
  modelId: string;
  label?: string;
}

interface ModelMenuProps {
  models: ModelWithProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (m: ModelSelection) => void;
  onOpenProvidersModal: () => void;
  onToggleFavourite?: (providerId: string, modelId: string, current: boolean) => void;
  efforts: Record<string, EffortLevel>;
  onSelectEffort: (providerId: string, modelId: string, effort: EffortLevel) => void;
  auto: boolean;
  onAutoChange: (enabled: boolean) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: "dark" | "light";
}

/**
 * Model pill plus its popover: collapsible search, Auto routing switch, the
 * fav/all segmented filter, and the effort flyout that tracks the hovered row.
 */
export function ModelMenu({
  models,
  selectedModel,
  onSelectModel,
  onOpenProvidersModal,
  onToggleFavourite,
  efforts,
  onSelectEffort,
  auto,
  onAutoChange,
  open,
  onOpenChange,
  theme,
}: ModelMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRevealed, setSearchRevealed] = useState(false);
  const [filterTab, setFilterTab] = useState<ModelFilterTab>("fav");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [pointerReady, setPointerReady] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const effortFlyoutRef = useRef<HTMLDivElement | null>(null);
  const hoveringRowRef = useRef(false);
  const hoveringEffortRef = useRef(false);
  const hideEffortTimerRef = useRef<number | null>(null);

  // The panel opens upwards by default, but must never run off the top of the
  // viewport: measure the anchor on open and flip below when space is short.
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [chromeHeight, setChromeHeight] = useState<number | null>(null);
  const [rowHeight, setRowHeight] = useState(38);
  const [rowGap, setRowGap] = useState(2);
  // Measured panel width, so the effort flyout sits beside the panel even when
  // the viewport caps its width.
  const [panelWidth, setPanelWidth] = useState(NOMINAL_PANEL_WIDTH);
  // Where the anchor sits, so the effort flyout can be held inside the viewport.
  const [anchorLeft, setAnchorLeft] = useState(0);
  // Top of the effort flyout, level with the hovered row.
  const [effortFlyoutTopPx, setEffortFlyoutTopPx] = useState(0);

  useEffect(() => {
    if (!open) return;

    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 12;
      const spaceAbove = rect.top - margin;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      // The panel prefers to open upwards; it only flips when the space above
      // cannot hold a usable panel and the space below is the better side.
      const chrome = chromeHeight ?? DEFAULT_CHROME_PX;
      const minimum = chrome + MIN_ROWS * rowHeight + (MIN_ROWS - 1) * rowGap;
      const next = spaceAbove >= minimum || spaceAbove >= spaceBelow ? "above" : "below";
      setPlacement(next);
      setAvailableHeight(Math.max(0, next === "above" ? spaceAbove : spaceBelow));
      if (Math.abs(rect.left - anchorLeft) > 0.5) setAnchorLeft(rect.left);
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, chromeHeight, rowHeight, rowGap, anchorLeft]);

  const clearHideEffortTimeout = useCallback(() => {
    if (hideEffortTimerRef.current !== null) {
      window.clearTimeout(hideEffortTimerRef.current);
      hideEffortTimerRef.current = null;
    }
  }, []);

  const scheduleHideEffort = useCallback(() => {
    clearHideEffortTimeout();
    hideEffortTimerRef.current = window.setTimeout(() => {
      if (!hoveringEffortRef.current && !hoveringRowRef.current) {
        setHoveredKey(null);
      }
    }, 60);
  }, [clearHideEffortTimeout]);

  useEffect(() => () => clearHideEffortTimeout(), [clearHideEffortTimeout]);

  // Reveal the search field shortly after opening, so the panel does not jump.
  useEffect(() => {
    if (!open) {
      setSearchRevealed(false);
      setSearchQuery("");
      setFilterTab("fav");
      setHoveredKey(null);
      setPointerReady(false);
      return;
    }
    const timer = window.setTimeout(() => setSearchRevealed(true), 160);
    return () => window.clearTimeout(timer);
  }, [open]);

  const activeModel = useMemo(() => {
    if (!selectedModel) return null;
    return (
      models.find(
        (m) =>
          m.providerId === selectedModel.providerId && m.modelId === selectedModel.modelId,
      ) ?? null
    );
  }, [models, selectedModel]);

  const activeEffort = activeModel
    ? (efforts[modelKey(activeModel.providerId, activeModel.modelId)] ?? DEFAULT_EFFORT)
    : DEFAULT_EFFORT;

  const favCount = useMemo(() => models.filter((m) => m.favourite).length, [models]);

  const visibleModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return models.filter((m) => {
      const matchesTab = filterTab === "fav" ? m.favourite : true;
      if (!matchesTab) return false;
      if (!q) return true;
      return (
        m.displayName.toLowerCase().includes(q) ||
        m.modelId.toLowerCase().includes(q) ||
        (m.provider?.displayName ?? "").toLowerCase().includes(q)
      );
    });
  }, [models, filterTab, searchQuery]);

  const hoveredModel = useMemo(
    () =>
      hoveredKey ? (models.find((m) => modelKey(m.providerId, m.modelId) === hoveredKey) ?? null) : null,
    [models, hoveredKey],
  );

  const isEffortMenuVisible = open && searchQuery.trim().length === 0 && hoveredModel !== null;

  // Beside the panel, but never past the right edge: on a narrow window the
  // flyout slides back over the panel rather than running off screen.
  const effortFlyoutLeftPx = useMemo(() => {
    const preferred = panelWidth + 10;
    if (typeof window === "undefined") return preferred;
    const roomFor = window.innerWidth - anchorLeft - EFFORT_FLYOUT_WIDTH - 10;
    return Math.max(0, Math.min(preferred, roomFor));
  }, [panelWidth, anchorLeft]);

  const rowElements = useCallback(
    () => Array.from(listRef.current?.querySelectorAll<HTMLElement>(".model-row") ?? []),
    [],
  );

  // The flyout sits level with the hovered row and is clamped to the panel, so
  // it stays attached to its row now that rows may wrap to two or three lines.
  // It is positioned against the anchor, the same origin the panel uses.
  useEffect(() => {
    if (!open || !hoveredKey) return;
    const id = window.requestAnimationFrame(() => {
      const anchor = rootRef.current;
      const panel = panelRef.current;
      const row = rowElements().find((el) => el.dataset.modelKey === hoveredKey);
      if (!anchor || !panel || !row) return;
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const flyoutHeight = effortFlyoutRef.current?.getBoundingClientRect().height ?? 0;
      const minimum = panelRect.top - anchorRect.top + 8;
      const maximum = Math.max(minimum, panelRect.bottom - anchorRect.top - flyoutHeight - 8);
      setEffortFlyoutTopPx(
        Math.max(minimum, Math.min(rowRect.top - anchorRect.top, maximum)),
      );
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, hoveredKey, rowElements, rowHeight, panelWidth]);

  /** Keeps a row inside the scrolling list without scrolling the page. */
  const revealRow = useCallback((key: string) => {
    const list = listRef.current;
    if (!list) return;
    const row = Array.from(list.querySelectorAll<HTMLElement>(".model-row")).find(
      (el) => el.dataset.modelKey === key,
    );
    if (!row) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top;
    else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom;
  }, []);

  // Arrow keys walk the catalogue through the same hover state the pointer
  // sets, so the highlight and the effort flyout follow either input.
  const moveActive = useCallback(
    (delta: number, takeFocus: boolean) => {
      if (visibleModels.length === 0) return;
      let current = hoveredKey
        ? visibleModels.findIndex((m) => modelKey(m.providerId, m.modelId) === hoveredKey)
        : -1;
      if (current < 0) {
        // Nothing active yet: start at the selection when there is one,
        // otherwise at the end the arrow points away from.
        current = selectedModel
          ? visibleModels.findIndex(
              (m) =>
                m.providerId === selectedModel.providerId && m.modelId === selectedModel.modelId,
            )
          : -1;
        if (current < 0) current = delta > 0 ? -1 : visibleModels.length;
      }
      const next = Math.min(visibleModels.length - 1, Math.max(0, current + delta));
      const target = visibleModels[next];
      const key = modelKey(target.providerId, target.modelId);
      setHoveredKey(key);
      setPointerReady(true);
      if (takeFocus) {
        rowElements()
          .find((row) => row.dataset.modelKey === key)
          ?.focus({ preventScroll: true });
      }
      revealRow(key);
    },
    [hoveredKey, rowElements, selectedModel, visibleModels, revealRow],
  );

  const selectedRowKey = selectedModel
    ? modelKey(selectedModel.providerId, selectedModel.modelId)
    : null;

  // Open the catalogue on the current selection rather than at the top: with
  // hundreds of models the chosen one is otherwise far off screen.
  useEffect(() => {
    if (!open || auto || !selectedRowKey) return;
    const id = window.requestAnimationFrame(() => revealRow(selectedRowKey));
    return () => window.cancelAnimationFrame(id);
  }, [open, auto, selectedRowKey, filterTab, searchQuery, revealRow]);

  // The catalogue shows at most nine rows and never fewer than three. The list
  // is sized from the shortest row it holds, so a wrapped name takes extra room
  // by scrolling rather than by shrinking the catalogue.
  const listMaxHeightPx = useMemo(() => {
    const ROW = rowHeight;
    const GAP = rowGap;
    const ideal = MAX_ROWS * ROW + (MAX_ROWS - 1) * GAP;
    if (availableHeight === null) return ideal;
    // Reserve the panel chrome (search row, Auto row, filter bar, footer and
    // padding), measured from the rendered panel so the list fills the rest.
    const budget = availableHeight - (chromeHeight ?? DEFAULT_CHROME_PX);
    const rows = Math.floor((budget + GAP) / (ROW + GAP));
    const clamped = Math.max(MIN_ROWS, Math.min(MAX_ROWS, rows));
    return clamped * ROW + (clamped - 1) * GAP;
  }, [availableHeight, chromeHeight, rowHeight, rowGap]);

  // The list carries its own row-snapped max height, and placement already
  // guarantees at least MIN_ROWS fit, so the panel needs no extra ceiling.

  // Measure everything in the panel except the scrolling row list, plus the
  // real row height and gap, so the cap tracks the rendered layout. Runs on
  // the frame after layout so the revealing search row is already counted.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const list = listRef.current;
      if (!panel || !list) return;
      // Sum the siblings rather than differencing heights: the list is already
      // capped by the time this runs, so a difference would feed back on itself.
      let chrome = 0;
      for (const child of Array.from(panel.children)) {
        if (child === list) continue;
        chrome += (child as HTMLElement).getBoundingClientRect().height;
      }
      const styles = getComputedStyle(panel);
      chrome += parseFloat(styles.paddingTop || "0") + parseFloat(styles.paddingBottom || "0");
      if (chrome > 0 && Math.abs(chrome - (chromeHeight ?? 0)) > 0.5) setChromeHeight(chrome);
      // Rows grow when a long model name wraps onto a second line. Size the
      // list from the shortest row so the catalogue keeps showing its usual
      // number of entries; taller rows simply scroll into view.
      let row = Infinity;
      for (const el of Array.from(list.querySelectorAll<HTMLElement>(".model-row"))) {
        const h = el.getBoundingClientRect().height;
        if (h > 0) row = Math.min(row, h);
      }
      if (Number.isFinite(row) && Math.abs(row - rowHeight) > 0.5) setRowHeight(row);
      const width = panel.getBoundingClientRect().width;
      if (width > 0 && Math.abs(width - panelWidth) > 0.5) setPanelWidth(width);
      const listStyles = getComputedStyle(list);
      const gap = parseFloat(listStyles.rowGap || listStyles.gap || "0");
      if (Number.isFinite(gap) && Math.abs(gap - rowGap) > 0.5) setRowGap(gap);
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, searchRevealed, filterTab, chromeHeight, rowHeight, rowGap, panelWidth]);

  const selectModel = (m: ModelWithProvider) => {
    onSelectModel({
      providerId: m.providerId,
      modelId: m.modelId,
      label: m.displayName || m.modelId,
    });
    onAutoChange(false);
    onOpenChange(false);
  };

  return (
    <div
      ref={rootRef}
      className="rosa-chat-theme relative inline-flex items-center"
      data-theme={theme}
      onKeyDown={(e) => {
        if (!open) return;
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        // Arrow keys never move the caret inside the search field; they walk
        // the list, but keep focus in the field so typing can continue.
        const typing =
          e.target instanceof HTMLElement &&
          (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
        e.preventDefault();
        moveActive(e.key === "ArrowDown" ? 1 : -1, !typing);
      }}
    >
      {auto ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Auto model routing"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenChange(!open);
            }
          }}
          className="auto-trigger-btn"
        >
          <span className="font-medium select-none" style={{ color: "var(--text-primary)" }}>
            Auto
          </span>
          <span className="auto-chevron mt-0.5" style={{ color: "var(--text-secondary)" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="auto-inline-switch">
            <span
              onClick={(e) => {
                e.stopPropagation();
                onAutoChange(false);
              }}
              className="ios-switch on"
              title="Turn off Auto routing"
              role="switch"
              aria-checked="true"
            >
              <span className="ios-switch-thumb" />
            </span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="model-trigger-btn"
          aria-haspopup="true"
          aria-expanded={open}
          title={activeModel ? activeModel.displayName || activeModel.modelId : undefined}
        >
          <ProviderBadge kind={activeModel?.provider?.kind} />
          {activeModel ? (
            <span className="flex items-baseline gap-1.5 whitespace-nowrap min-w-0">
              <span
                className="font-medium truncate max-w-[240px]"
                style={{ color: "var(--text-primary)" }}
              >
                {activeModel.displayName || activeModel.modelId}
              </span>
              <span className="font-normal shrink-0" style={{ color: "var(--text-secondary)" }}>
                {activeEffort}
              </span>
            </span>
          ) : (
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              Select model
            </span>
          )}
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            className="mt-0.5 shrink-0"
            style={{ color: "var(--text-secondary)" }}
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
      )}

      {/* Popover */}
      <div
        ref={panelRef}
        className={`glass-popover ${open ? "popover-visible" : "popover-hidden"} absolute left-0 ${
          placement === "above" ? "bottom-0" : "top-[calc(100%+8px)]"
        } w-[380px] max-w-[calc(100vw_-_32px)] rounded-[20px] p-2 z-30 flex flex-col`}
        style={undefined}
      >
        {/* Collapsible search */}
        <div
          onMouseEnter={() => {
            hoveringRowRef.current = false;
            setHoveredKey(null);
          }}
          className={`search-row-wrap ${searchRevealed || searchQuery.length > 0 ? "revealed" : ""}`}
        >
          <div className="flex items-center gap-2 px-2.5 h-8 rounded-lg">
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              className="flex-shrink-0"
              style={{ color: "var(--text-secondary)" }}
              aria-hidden="true"
            >
              <circle cx="7.2" cy="7.2" r="4.8" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M10.8 10.8L13.8 13.8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models"
              autoComplete="off"
              className="w-full bg-transparent border-none outline-none text-[14.5px] font-normal tracking-[-0.011em]"
              style={{ color: "var(--text-primary)" }}
              aria-label="Search models"
            />
          </div>
        </div>

        {/* Auto row */}
        <div
          onMouseEnter={() => {
            hoveringRowRef.current = false;
            setHoveredKey(null);
          }}
          className="flex items-center justify-between px-2.5 h-9"
        >
          <span
            className="text-[15px] font-medium tracking-[-0.011em]"
            style={{ color: "var(--text-primary)" }}
          >
            Auto
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={auto}
            onClick={() => onAutoChange(!auto)}
            className={`ios-switch ${auto ? "on" : ""}`}
          >
            <span className="ios-switch-thumb" />
          </button>
        </div>

        {/* fav / all filter */}
        <div
          role="tablist"
          aria-label="Filter models"
          onMouseEnter={() => {
            hoveringRowRef.current = false;
            setHoveredKey(null);
          }}
          className="model-filter-bar"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "fav"}
            onClick={() => {
              setFilterTab("fav");
              setHoveredKey(null);
            }}
            className={`model-filter-pill ${filterTab === "fav" ? "active" : ""}`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill={filterTab === "fav" ? "#FACC15" : "none"}
              stroke={filterTab === "fav" ? "#FACC15" : "currentColor"}
              strokeWidth="1.4"
              strokeLinejoin="round"
              className="flex-shrink-0"
              aria-hidden="true"
            >
              <path d="M8 1.6L9.95 5.55L14.3 6.18L11.15 9.25L11.89 13.58L8 11.53L4.11 13.58L4.85 9.25L1.7 6.18L6.05 5.55L8 1.6Z" />
            </svg>
            <span>fav</span>
            {favCount > 0 && (
              <span
                className="text-[11.5px] font-normal opacity-75"
                style={{ color: "var(--text-secondary)" }}
              >
                {favCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "all"}
            onClick={() => {
              setFilterTab("all");
              setHoveredKey(null);
            }}
            className={`model-filter-pill ${filterTab === "all" ? "active" : ""}`}
          >
            <span>all</span>
            <span
              className="text-[11.5px] font-normal opacity-70"
              style={{ color: "var(--text-secondary)" }}
            >
              {models.length}
            </span>
          </button>
        </div>

        {/* Model rows */}
        <div
          ref={listRef}
          role={visibleModels.length > 0 ? "listbox" : undefined}
          aria-label={visibleModels.length > 0 ? "Models" : undefined}
          className="flex flex-col gap-0.5 min-h-0 flex-1 overflow-y-auto composer-scroll"
          style={{ maxHeight: `${listMaxHeightPx}px` }}
        >
          {visibleModels.length === 0 ? (
            <div
              className="px-3 py-3 text-center text-[13px] tracking-[-0.01em]"
              style={{ color: "var(--text-secondary)" }}
            >
              {models.length === 0 ? (
                <>
                  No models discovered yet.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenProvidersModal();
                    }}
                    className="underline font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Add a provider
                  </button>
                  .
                </>
              ) : filterTab === "fav" ? (
                <>
                  No favourite models yet. Switch to{" "}
                  <button
                    type="button"
                    onClick={() => setFilterTab("all")}
                    className="underline font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    all
                  </button>{" "}
                  and press ★ to add.
                </>
              ) : searchQuery.trim() ? (
                "No matching models"
              ) : (
                "No models available"
              )}
            </div>
          ) : (
            visibleModels.map((m) => {
              const key = modelKey(m.providerId, m.modelId);
              const isSelected = !auto && key === modelKey(selectedModel?.providerId ?? "", selectedModel?.modelId ?? "");
              const isHovered = key === hoveredKey && searchQuery.trim().length === 0;
              const effort = efforts[key] ?? DEFAULT_EFFORT;

              return (
                <div
                  key={key}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  data-model-key={key}
                  onClick={() => selectModel(m)}
                  title={m.displayName || m.modelId}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      selectModel(m);
                    }
                  }}
                  onMouseEnter={() => {
                    clearHideEffortTimeout();
                    hoveringRowRef.current = true;
                    if (pointerReady) setHoveredKey(key);
                  }}
                  onMouseMove={() => {
                    clearHideEffortTimeout();
                    hoveringRowRef.current = true;
                    if (!pointerReady) setPointerReady(true);
                    if (hoveredKey !== key) setHoveredKey(key);
                  }}
                  onMouseLeave={() => {
                    hoveringRowRef.current = false;
                    scheduleHideEffort();
                  }}
                  className={`model-row ${isHovered ? "active-hover" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                    <ProviderBadge kind={m.provider?.kind} />
                    <span
                      className="text-[14.5px] font-medium flex-1 min-w-0 whitespace-normal break-words leading-[1.3]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {m.displayName || m.modelId}
                    </span>
                    <span
                      className="text-[14.5px] font-normal shrink-0"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {effort}
                    </span>
                    {onToggleFavourite && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavourite(m.providerId, m.modelId, m.favourite);
                        }}
                        className={`fav-star-btn ${m.favourite ? "starred" : ""}`}
                        title={m.favourite ? "Remove from favourites" : "Add to favourites"}
                        aria-label={`Toggle favourite for ${m.displayName || m.modelId}`}
                      >
                        {m.favourite ? (
                          <svg
                            width="13.5"
                            height="13.5"
                            viewBox="0 0 16 16"
                            fill="#FACC15"
                            stroke="#FACC15"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M8 1.6L9.95 5.55L14.3 6.18L11.15 9.25L11.89 13.58L8 11.53L4.11 13.58L4.85 9.25L1.7 6.18L6.05 5.55L8 1.6Z" />
                          </svg>
                        ) : (
                          <svg
                            width="13.5"
                            height="13.5"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.35"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M8 1.6L9.95 5.55L14.3 6.18L11.15 9.25L11.89 13.58L8 11.53L4.11 13.58L4.85 9.25L1.7 6.18L6.05 5.55L8 1.6Z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                  {isSelected && <CheckmarkIcon />}
                </div>
              );
            })
          )}
        </div>

        {/* Manage providers */}
        <div className="pt-1.5 mt-1.5" style={{ borderTop: "1px solid var(--card-border)" }}>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenProvidersModal();
            }}
            className="w-full text-center text-[13px] py-1.5 rounded-[10px] transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            Manage providers &amp; keys
          </button>
        </div>
      </div>

      {/* Effort flyout */}
      <div
        ref={effortFlyoutRef}
        onMouseEnter={() => {
          clearHideEffortTimeout();
          hoveringEffortRef.current = true;
        }}
        onMouseLeave={() => {
          hoveringEffortRef.current = false;
          scheduleHideEffort();
        }}
        style={{ left: effortFlyoutLeftPx, top: effortFlyoutTopPx }}
        className={`glass-popover effort-submenu-bridge ${isEffortMenuVisible ? "popover-visible" : "popover-hidden"} absolute w-[148px] rounded-[18px] p-2 z-30`}
      >
        <div
          className="px-2.5 py-1.5 text-[14.5px] font-medium tracking-[-0.011em]"
          style={{ color: "var(--effort-header)" }}
        >
          Effort
        </div>
        <div className="flex flex-col gap-0.5">
          {EFFORT_LEVELS.map((level) => {
            const active = hoveredModel
              ? (efforts[modelKey(hoveredModel.providerId, hoveredModel.modelId)] ?? DEFAULT_EFFORT) === level
              : false;
            return (
              <button
                key={level}
                type="button"
                onClick={() => {
                  if (!hoveredModel) return;
                  onSelectEffort(hoveredModel.providerId, hoveredModel.modelId, level);
                }}
                className="mode-menu-item h-[34px] px-2.5 text-[14.5px]"
              >
                <span>{level}</span>
                {active && <CheckmarkIcon />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
