import * as Dialog from "@radix-ui/react-dialog";
import { X, Check, Plus, Palette } from "lucide-react";
import { AcmeLogo } from "./icons/AcmeLogo";

interface BrandKitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BrandKitModal({ isOpen, onClose }: BrandKitModalProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-lg bg-[#262e28] border border-white/10 rounded-2xl shadow-2xl z-50 p-6 text-neutral-100">
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <Palette className="w-5 h-5 text-neutral-300" />
              <div>
                <Dialog.Title className="text-lg font-semibold text-white tracking-tight">
                  My Brands & Assets
                </Dialog.Title>
                <Dialog.Description className="text-xs text-neutral-500 mt-0.5">
                  Brand voices, logos, fonts and color rules for email generation
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-4 my-5">
            <div className="p-4 rounded-xl border-2 border-[#558766]/70 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-black border border-white/10 flex items-center justify-center">
                    <AcmeLogo className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Acme Global</h4>
                    <p className="text-[11px] text-neutral-500">Default brand voice & guidelines</p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold bg-[#558766] text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3" /> Active
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-3 text-xs text-neutral-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#11120c] border border-white/20" />
                  <span className="w-3 h-3 rounded-full bg-[#558766]" />
                  <span className="w-3 h-3 rounded-full bg-[#39443b]" />
                </div>
                <span>• Font: Inter</span>
                <span>• Tone: Confident & Modern</span>
              </div>
            </div>

            <button className="w-full py-3 border border-dashed border-white/20 hover:border-white/50 rounded-xl text-xs font-medium text-neutral-400 hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" />
              <span>Add Another Brand or Sub-Brand</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
