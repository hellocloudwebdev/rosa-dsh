import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Copy, Check, Send, Sparkles, RefreshCw, Mail } from "lucide-react";
import type { GeneratedEmail } from "../types";
import { AceMoonIcon } from "./icons/AceMoonIcon";

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: GeneratedEmail | null;
  onRegenerate: () => void;
  isGenerating: boolean;
}

export function EmailPreviewModal({
  isOpen,
  onClose,
  email,
  onRegenerate,
  isGenerating,
}: EmailPreviewModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!email) return;
    const fullContent = `Subject: ${email.subject}\nPreview: ${email.previewText}\n\n${email.headline}\n\n${email.body.join("\n\n")}\n\nCTA: ${email.ctaText} (${email.ctaLink})`;
    navigator.clipboard.writeText(fullContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-2xl max-h-[88vh] bg-[#262e28] border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden text-neutral-100">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
            <div className="flex items-center gap-2.5">
              <AceMoonIcon className="w-4 h-4" />
              <Dialog.Title className="text-sm font-semibold text-white tracking-tight">
                Generated with Ace Studio 2.0
              </Dialog.Title>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onRegenerate}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                <span>Regenerate</span>
              </button>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-neutral-900 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy Copy"}</span>
              </button>

              <Dialog.Close asChild>
                <button
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#1d231e]">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                <Sparkles className="w-8 h-8 text-[#8cd6a5] animate-spin" />
                <p className="text-sm font-medium text-neutral-100">
                  Crafting email with Ace Studio 2.0 reasoning engine...
                </p>
                <p className="text-xs text-neutral-500">
                  Analyzing email tone, spam-filter score, and CTA clarity
                </p>
              </div>
            ) : email ? (
              <>
                <div className="bg-[#262e28] rounded-xl p-4 border border-white/10 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-neutral-500 w-16 shrink-0 pt-0.5">
                      Subject:
                    </span>
                    <span className="text-sm font-medium text-white">{email.subject}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-neutral-500 w-16 shrink-0 pt-0.5">
                      Preheader:
                    </span>
                    <span className="text-xs text-neutral-400">{email.previewText}</span>
                  </div>
                </div>

                {/* Rendered email preview (light) */}
                <div className="bg-white text-neutral-900 rounded-xl border border-white/10 p-8 max-w-xl mx-auto space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-neutral-900 text-white flex items-center justify-center text-[10px] font-bold">
                        A
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-800">
                        Acme Brand
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-400">View in browser</span>
                  </div>

                  <h2 className="text-2xl font-bold tracking-tight leading-snug">{email.headline}</h2>

                  <div className="space-y-4 text-[14.5px] leading-relaxed text-neutral-700">
                    {email.body.map((p, idx) => (
                      <p key={idx}>{p}</p>
                    ))}
                  </div>

                  <div className="pt-2">
                    <a
                      href={email.ctaLink}
                      onClick={(e) => e.preventDefault()}
                      className="inline-block px-6 py-3 bg-neutral-950 text-white text-sm font-semibold rounded-xl hover:bg-neutral-800 transition-colors"
                    >
                      {email.ctaText}
                    </a>
                  </div>

                  <div className="pt-6 border-t border-neutral-100 text-center text-xs text-neutral-400 space-y-1">
                    <p>© 2026 Acme AI Inc. All rights reserved.</p>
                    <p>
                      You received this email because you subscribed to Acme Studio updates.{" "}
                      <span className="underline cursor-pointer">Unsubscribe</span>
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/5">
            <span className="text-xs text-neutral-500 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Ready to send or export to ESP
            </span>
            <div className="flex items-center gap-2">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 rounded-lg transition-colors cursor-pointer">
                  Close
                </button>
              </Dialog.Close>
              <button
                onClick={() => {
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#558766] text-white hover:bg-[#63977a] rounded-lg transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Create Campaign</span>
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
