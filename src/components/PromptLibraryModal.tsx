import * as Dialog from "@radix-ui/react-dialog";
import { X, Sparkles, Code2, Brain, Scale, ShieldAlert, ArrowRight, Lightbulb } from "lucide-react";
import { useState } from "react";

interface PromptLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (promptText: string) => void;
}

interface PromptItem {
  id: string;
  title: string;
  category: "Code & Architecture" | "Reasoning & Analysis" | "Comparison" | "Writing";
  description: string;
  prompt: string;
  icon: typeof Code2;
}

const PROMPTS: PromptItem[] = [
  {
    id: "arch-review",
    title: "System Architecture & Scalability Review",
    category: "Code & Architecture",
    description: "Evaluate system architecture for throughput, database bottlenecks, and resilience.",
    prompt: `Analyze the following architecture/code for production deployment:
1. Identify primary bottlenecks (CPU, memory, database connection pool, I/O latency).
2. Assess single points of failure (SPOF) and disaster recovery capabilities.
3. Propose 3 concrete architectural improvements with concrete trade-offs.

Here is the system overview:
`,
    icon: Code2,
  },
  {
    id: "ts-refactor",
    title: "TypeScript Strict Refactor & Type-Safety",
    category: "Code & Architecture",
    description: "Refactor legacy or untyped JavaScript/TypeScript into modular, zero-any code.",
    prompt: `Refactor the provided TypeScript code adhering to modern standards:
- Eliminate all 'any' types with proper discriminated unions or generics.
- Apply strict immutability and functional composition where appropriate.
- Ensure exhaustive switch statements with 'never' checks.
- Add concise JSDoc explaining contract invariants.

Code to refactor:
`,
    icon: Code2,
  },
  {
    id: "sec-audit",
    title: "Full Security & SSRF / AuthZ Audit",
    category: "Code & Architecture",
    description: "Audit endpoints for SSRF, authorization bypass, injection, and session leakage.",
    prompt: `Perform an adversarial security audit on the following API handler:
1. SSRF check: Can user-supplied URLs target 127.0.0.1, AWS metadata (169.254.169.254), or LAN subnets?
2. AuthZ check: Are ownership boundaries enforced on resource deletion/modification?
3. Input validation: Test for buffer overflows, prototype pollution, and SQL injection.

Endpoint implementation:
`,
    icon: ShieldAlert,
  },
  {
    id: "first-principles",
    title: "First Principles Decomposition",
    category: "Reasoning & Analysis",
    description: "Break complex technical problem down to basic axioms and reconstruct solution.",
    prompt: `Let's analyze this problem from fundamental first principles:
1. What are the undeniable physical/computational constraints (e.g. CAP theorem, memory bandwidth, network RTT)?
2. What assumptions are we taking for granted that might actually be false?
3. Reconstruct a minimal, optimal solution from scratch without legacy baggage.

Problem statement:
`,
    icon: Brain,
  },
  {
    id: "devils-advocate",
    title: "Adversarial Devil's Advocate",
    category: "Reasoning & Analysis",
    description: "Challenge an engineering proposal by identifying hidden risks and failure modes.",
    prompt: `Act as a principal staff engineer acting as devil's advocate. Challenge this engineering proposal:
- Highlight 3 ways this design will fail under peak load or network partitions.
- What maintenance burdens or developer ergonomics issues are being underestimated?
- What would a much simpler alternative look like?

Proposal:
`,
    icon: Lightbulb,
  },
  {
    id: "model-compare",
    title: "Multi-Model Comparison Benchmark",
    category: "Comparison",
    description: "Formulate a rigorous prompt to benchmark reasoning differences across LLMs.",
    prompt: `Solve this algorithmic challenge with detailed step-by-step reasoning:
Problem: Implement an LRU Cache with O(1) get and put operations, thread-safe or async-safe.
Explain your data structure choices (doubly linked list + hash map) and handle edge cases (eviction when capacity=1, updating existing key).
`,
    icon: Scale,
  },
];

export function PromptLibraryModal({
  isOpen,
  onClose,
  onSelectPrompt,
}: PromptLibraryModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = ["All", "Code & Architecture", "Reasoning & Analysis", "Comparison"];

  const filtered = selectedCategory === "All"
    ? PROMPTS
    : PROMPTS.filter((p) => p.category === selectedCategory);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-2xl max-h-[85vh] bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-2xl shadow-2xl z-50 flex flex-col text-[var(--text-primary)] overflow-hidden focus:outline-none">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--lime)]/15 border border-[var(--lime)]/30 text-[var(--lime-text)] flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold tracking-tight">
                  Prompt & Benchmark Library
                </Dialog.Title>
                <Dialog.Description className="text-xs text-[var(--text-muted)] mt-0.5">
                  Curated engineering, reasoning, and multi-model benchmark prompts
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Categories Tab Bar */}
          <div className="px-6 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-panel-2)]/60 flex items-center gap-2 overflow-x-auto shrink-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                  selectedCategory === cat
                    ? "bg-[var(--lime)] text-white font-semibold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {filtered.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectPrompt(item.prompt);
                    onClose();
                  }}
                  className="p-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel-2)] hover:border-[var(--lime)]/50 hover:bg-[var(--hover-overlay)] transition-all cursor-pointer group flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[var(--hover-overlay)] text-[var(--lime-text)] flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--lime-text)] transition-colors">
                          {item.title}
                        </h4>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-black/20 text-[var(--text-muted)]">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <span className="flex items-center gap-1 text-xs font-medium text-[var(--lime-text)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-1">
                    <span>Use Prompt</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
