import * as Dialog from "@radix-ui/react-dialog";
import { X, ArrowRight } from "lucide-react";

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (prompt: string) => void;
}

const TEMPLATES = [
  {
    title: "Welcome Onboarding Series",
    category: "Lifecycle",
    desc: "3-part sequence introducing new users to core value props and special coupon.",
    prompt:
      "Write a 3-part onboarding email sequence for a modern SaaS product with clear milestone guides and CTA.",
  },
  {
    title: "Product Feature Announcement",
    category: "Marketing",
    desc: "Showcase new features with before/after comparisons and customer testimonials.",
    prompt:
      "Draft an engaging product announcement email for a major AI update with 3 bullet benefits and customer proof.",
  },
  {
    title: "Win-Back / Re-engagement",
    category: "Retention",
    desc: "Reignite customer interest with personalized incentives and new catalog highlights.",
    prompt:
      "Create a persuasive win-back email for subscribers inactive for 60+ days with an irresistible offer.",
  },
  {
    title: "Curated Weekly Digest",
    category: "Newsletter",
    desc: "Editorial layout with featured articles, community spotlight, and quick tips.",
    prompt:
      "Generate a weekly roundup newsletter with an editor's note, 3 curated insights, and a community poll.",
  },
];

export function TemplatesModal({ isOpen, onClose, onSelectTemplate }: TemplatesModalProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-2xl max-h-[85vh] bg-[#262e28] border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col p-6 text-neutral-100 overflow-hidden">
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div>
              <Dialog.Title className="text-lg font-semibold text-white tracking-tight">
                Email Templates Gallery
              </Dialog.Title>
              <Dialog.Description className="text-xs text-neutral-500 mt-0.5">
                Curated high-performing templates optimized for deliverability
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 my-5 overflow-y-auto">
            {TEMPLATES.map((tpl, i) => (
              <div
                key={i}
                onClick={() => {
                  onSelectTemplate(tpl.prompt);
                  onClose();
                }}
                className="group p-4 rounded-xl border border-white/10 hover:border-white/40 hover:bg-white/5 transition-colors cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    {tpl.category}
                  </span>
                  <h4 className="text-sm font-semibold text-white mt-1">{tpl.title}</h4>
                  <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{tpl.desc}</p>
                </div>
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/5 text-xs font-medium text-neutral-200">
                  <span>Use Template</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
