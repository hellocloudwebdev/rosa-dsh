import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X, Check } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ViewType } from "../../types";
import {
  VIEW_LIST,
  viewMeta,
  EmailPreviewView,
  BrowserView,
  CodeView,
  MarkdownView,
  PdfView,
  ImageView,
  DiffView,
  TerminalView,
  ProjectView,
  type ViewProps,
} from "./views";

interface ViewPanelProps {
  viewType: ViewType;
  onTypeChange: (t: ViewType) => void;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  maxWidth: number;
  viewProps: ViewProps;
}

const MIN_WIDTH = 400;

export function ViewPanel({
  viewType,
  onTypeChange,
  onClose,
  width,
  onWidthChange,
  maxWidth,
  viewProps,
}: ViewPanelProps) {
  const meta = viewMeta(viewType);

  const handleResizeStart = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(maxWidth, Math.max(MIN_WIDTH, startW - (ev.clientX - startX)));
      onWidthChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const renderView = () => {
    switch (viewType) {
      case "email":
        return <EmailPreviewView {...viewProps} />;
      case "browser":
        return <BrowserView {...viewProps} />;
      case "code":
        return <CodeView {...viewProps} />;
      case "markdown":
        return <MarkdownView {...viewProps} />;
      case "pdf":
        return <PdfView {...viewProps} />;
      case "image":
        return <ImageView {...viewProps} />;
      case "diff":
        return <DiffView {...viewProps} />;
      case "terminal":
        return <TerminalView {...viewProps} />;
      case "project":
        return <ProjectView {...viewProps} />;
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="relative h-full shrink-0 flex flex-col bg-[var(--bg-panel)] border-l border-[var(--border-subtle)]"
      style={{ width }}
    >
      {/* Left resize handle */}
      <div
        onPointerDown={handleResizeStart}
        className="absolute inset-y-0 left-0 w-1 cursor-col-resize hover:bg-[var(--lime)]/50 transition-colors z-30"
        title="Drag to resize"
      />

      {/* Panel header */}
      <div className="h-12 shrink-0 border-b border-[var(--border-subtle)] px-3 flex items-center justify-between">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[var(--hover-overlay)] text-sm text-[var(--text-primary)] cursor-pointer outline-none transition-colors">
              <span className="text-[var(--lime-text)]">{meta.icon}</span>
              <span className="font-medium">{meta.label}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={6}
              className="w-52 bg-[#262e28] rounded-xl p-1.5 border border-white/5 shadow-2xl z-50 focus:outline-none"
            >
              {VIEW_LIST.map((v) => (
                <DropdownMenu.Item
                  key={v.type}
                  onSelect={() => onTypeChange(v.type)}
                  className={`flex items-center justify-between px-2.5 py-2 text-sm rounded-lg cursor-pointer outline-none transition-colors ${
                    v.type === viewType
                      ? "bg-white/10 text-white font-medium"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-[var(--lime-text)]">{v.icon}</span>
                    {v.label}
                  </span>
                  {v.type === viewType && <Check className="w-3.5 h-3.5 text-neutral-200" />}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          onClick={onClose}
          aria-label="Close view"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto p-5 relative">
        <AnimatePresence>
          {viewProps.isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[var(--bg-panel)]/70 backdrop-blur-[2px] flex items-center justify-center z-20"
            >
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Generating view…
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {renderView()}
      </div>
    </motion.section>
  );
}
