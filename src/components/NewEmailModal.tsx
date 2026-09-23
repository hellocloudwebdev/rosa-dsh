import * as Dialog from "@radix-ui/react-dialog";
import { X, Sparkles, FileText, Layout, Copy, ArrowRight } from "lucide-react";

interface NewEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOption: (option: string) => void;
}

export function NewEmailModal({ isOpen, onClose, onSelectOption }: NewEmailModalProps) {
  const options = [
    {
      id: "ai-prompt",
      title: "Draft with Ace Studio AI",
      desc: "Prompt our AI engine to generate an entire campaign from your ideas.",
      icon: <Sparkles className="w-5 h-5 text-[#558766]" />,
      badge: "Ace 2.0",
    },
    {
      id: "template",
      title: "Start from a Template",
      desc: "Select from dozens of battle-tested conversion templates.",
      icon: <Layout className="w-5 h-5 text-sky-400" />,
    },
    {
      id: "blank",
      title: "Blank Canvas",
      desc: "Code or write custom HTML/Markdown with real-time preview.",
      icon: <FileText className="w-5 h-5 text-neutral-300" />,
    },
    {
      id: "clone",
      title: "Duplicate Recent Campaign",
      desc: "Reuse successful layouts, audience filters, and tracking links.",
      icon: <Copy className="w-5 h-5 text-purple-400" />,
    },
  ];

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-lg bg-[#262e28] border border-white/10 rounded-2xl shadow-2xl z-50 p-6 text-neutral-100">
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div>
              <Dialog.Title className="text-lg font-semibold text-white tracking-tight">
                Create New Email
              </Dialog.Title>
              <Dialog.Description className="text-xs text-neutral-500 mt-0.5">
                Choose how you want to build your next message
              </Dialog.Description>
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

          <div className="grid gap-2.5 mt-5">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  onSelectOption(opt.id);
                  onClose();
                }}
                className="group flex items-center justify-between p-3.5 rounded-xl border border-white/10 hover:border-white/40 hover:bg-white/5 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors shrink-0">
                    {opt.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{opt.title}</span>
                      {opt.badge && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#558766] text-white px-1.5 py-0.5 rounded">
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
