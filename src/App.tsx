import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Sidebar, type Theme } from "./components/Sidebar";
import { StudioHeader } from "./components/StudioHeader";
import { AcmeLogo } from "./components/icons/AcmeLogo";
import { Composer } from "./components/composer/Composer";
import type { Mode } from "./components/composer/ModeMenu";
import type { ModelSel } from "./components/composer/ModelMenu";
import { UpgradeBanner } from "./components/composer/UpgradeBanner";
import { SuggestedList } from "./components/SuggestedList";
import { EmailPreviewModal } from "./components/EmailPreviewModal";
import { NewEmailModal } from "./components/NewEmailModal";
import { TemplatesModal } from "./components/TemplatesModal";
import { BrandKitModal } from "./components/BrandKitModal";
import type { NavItemId, GeneratedEmail } from "./types";

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
  meta: string;
}

const INITIAL_EMAIL: GeneratedEmail = {
  subject: "Welcome to Acme — Your exclusive 15% discount is inside 🎉",
  previewText: "We're thrilled to have you. Here is everything you need to get started.",
  headline: "Welcome to a smarter way to craft emails",
  body: [
    "Thank you for joining Acme AI. We built Ace Studio with one singular mission: to make every email you send thoughtful, high-converting, and impossible for your subscribers to ignore.",
    "As a special welcome gift, use the code WELCOME15 at checkout on any plan upgrade or premium template bundle this month.",
    "Explore your workspace, connect your custom sending domain, and start drafting your first campaign in under two minutes.",
  ],
  ctaText: "Claim Your 15% Discount →",
  ctaLink: "https://acme.ai/claim-offer",
};

const DEFAULT_MODEL: ModelSel = {
  id: "fable-5",
  name: "Fable 5",
  effort: "High",
  icon: "star",
};

export function App() {
  const [activeNav, setActiveNav] = useState<NavItemId>("new-email");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("Build");
  const [model, setModel] = useState<ModelSel>(DEFAULT_MODEL);
  const [auto, setAuto] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState("Q4 Onboarding & Welcome Sequence");
  const [banner, setBanner] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [currentEmail, setCurrentEmail] = useState<GeneratedEmail>(INITIAL_EMAIL);
  const listRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem("acme-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("acme-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isNewEmailOpen, setIsNewEmailOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isBrandsOpen, setIsBrandsOpen] = useState(false);

  const engine = auto ? "Auto" : `${model.name} ${model.effort}`;

  const handleGenerate = (promptText: string) => {
    const text = promptText.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", text, meta: `${mode} · ${engine}` },
    ]);
    setIsLoading(true);

    setTimeout(() => {
      const lower = text.toLowerCase();
      let emailResult: GeneratedEmail;

      if (lower.includes("welcome") || lower.includes("onboarding")) {
        emailResult = {
          subject: "Welcome to Acme — Your exclusive 15% discount is inside 🎉",
          previewText: "We're thrilled to have you. Here is everything you need to get started.",
          headline: "Welcome to a smarter way to craft emails",
          body: [
            "Thank you for joining Acme AI. We built Ace Studio with one singular mission: to make every email you send thoughtful, high-converting, and impossible for your subscribers to ignore.",
            "As a special welcome gift, use the code WELCOME15 at checkout on any plan upgrade or premium template bundle this month.",
            "Explore your workspace, connect your custom sending domain, and start drafting your first campaign in under two minutes.",
          ],
          ctaText: "Claim Your 15% Discount →",
          ctaLink: "https://acme.ai/claim-offer",
        };
      } else if (lower.includes("product") || lower.includes("launch") || lower.includes("ai")) {
        emailResult = {
          subject: "Introducing Ace Studio 2.0: Deep Reasoning for Email Marketing",
          previewText: "Higher open rates, instant copy variations, and brand-safe email intelligence.",
          headline: "The next generation of email creation has arrived",
          body: [
            "Today we are proud to release Ace Studio 2.0 — our biggest upgrade yet. Powered by advanced contextual reasoning, it understands your brand voice, predicts spam filters, and crafts layouts designed to convert.",
            "Key updates include real-time tone tuning, multi-channel segmentation previews, and one-click export to your existing ESP.",
            "Experience the new standard for email marketing teams worldwide.",
          ],
          ctaText: "Explore Ace Studio 2.0 →",
          ctaLink: "https://acme.ai/ace-2",
        };
      } else if (
        lower.includes("re-engagement") ||
        lower.includes("inactive") ||
        lower.includes("automate")
      ) {
        emailResult = {
          subject: "We miss you! Here is $20 towards your next project",
          previewText: "A lot has improved since your last visit. Come see what's new.",
          headline: "It's been a while, and we've saved your spot",
          body: [
            "We noticed you haven't dropped by recently, and we wanted to check in. Over the last month, we've shipped over 20 new features and speed optimizations.",
            "To welcome you back, we've credited $20 directly to your Acme account, ready to apply toward any active campaign or subscription renewal.",
            "Take a quick peek and see how much faster your team can move.",
          ],
          ctaText: "Activate My $20 Credit →",
          ctaLink: "https://acme.ai/welcome-back",
        };
      } else {
        emailResult = {
          subject: `Campaign Draft: ${text.slice(0, 45)}...`,
          previewText: "Custom generated copy tailored to your prompt and audience.",
          headline: "Crafted specifically for your campaign goals",
          body: [
            `Based on your request: "${text}", our ${engine} engine optimized this layout for clarity and customer engagement.`,
            "Every sentence has been structured to maintain high reader retention and encourage immediate response.",
            "Review the copy, adjust tone parameters as needed, and deploy directly to your audience segments.",
          ],
          ctaText: "Deploy This Campaign →",
          ctaLink: "https://acme.ai/deploy",
        };
      }

      setCurrentEmail(emailResult);
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: `Draft ready — “${emailResult.subject}”`,
          meta: `Ace Studio 2.0 · Deliverability 98/100 · ${engine}`,
        },
      ]);
    }, 800);
  };

  return (
    <div
      className={`w-screen h-screen flex overflow-hidden select-none font-sans text-[var(--text-primary)] transition-colors duration-300 ${
        theme === "dark" ? "theme-dark" : "theme-light"
      }`}
    >
      {/* Left Navigation Sidebar */}
      <Sidebar
        activeItem={activeNav}
        onSelectItem={setActiveNav}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        onOpenNewEmailModal={() => setIsNewEmailOpen(true)}
        onOpenTemplatesModal={() => setIsTemplatesOpen(true)}
        onOpenBrandsModal={() => setIsBrandsOpen(true)}
        theme={theme}
        onSetTheme={setTheme}
      />

      {/* Main Studio — Composer only */}
      <div className="flex-1 h-screen flex flex-col overflow-hidden">
        <StudioHeader
          campaignTitle={campaignTitle}
          onChangeTitle={setCampaignTitle}
          onSendTest={() => alert(`Test email sent to your inbox for "${currentEmail.subject}"!`)}
          onDeploy={() => setIsPreviewOpen(true)}
        />

        <div className="flex-1 overflow-y-auto flex bg-[var(--bg-app)] transition-colors duration-300">
          <div className="m-auto w-full max-w-[620px] px-6 py-14 flex flex-col">
            {/* Transcript */}
            {(messages.length > 0 || isLoading) && (
              <div ref={listRef} className="mb-7 space-y-3 max-h-[36vh] overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {messages.map((m) => (
                    <motion.div
                      key={m.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex gap-2.5"
                    >
                      {m.role === "assistant" && (
                        <AcmeLogo className="w-4 h-4 mt-1 text-[var(--lime-text)] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={`text-sm leading-relaxed whitespace-pre-wrap ${
                            m.role === "user"
                              ? "text-[var(--text-primary)]"
                              : "text-[var(--text-secondary)]"
                          }`}
                        >
                          {m.text}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{m.meta}</p>
                      </div>
                    </motion.div>
                  ))}
                  {isLoading && (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 text-sm text-[var(--text-secondary)] pl-[26px]"
                    >
                      <Sparkles className="w-4 h-4 text-[var(--lime-text)] animate-spin" />
                      <span>Ace is drafting your email…</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Hero */}
            <div className="mb-6">
              <div className="mb-5">
                <AcmeLogo className="w-8 h-8 text-[var(--text-primary)]" />
              </div>
              <h1 className="text-[30px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] leading-tight transition-colors">
                Create Emails Worth Opening
              </h1>
            </div>

            {/* Video-style composer (follows theme, all animations kept) */}
            <Composer
              value={prompt}
              onValueChange={setPrompt}
              onSubmit={() => handleGenerate(prompt)}
              mode={mode}
              onModeChange={setMode}
              model={model}
              onModelChange={setModel}
              auto={auto}
              onAutoChange={setAuto}
              theme={theme}
            />

            {/* Upgrade banner (same green in both themes) */}
            <AnimatePresence>
              {banner && <UpgradeBanner onDismiss={() => setBanner(false)} />}
            </AnimatePresence>

            {/* Suggestions */}
            <SuggestedList
              onSelectPrompt={(p) => {
                setPrompt(p);
                handleGenerate(p);
              }}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <EmailPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        email={currentEmail}
        onRegenerate={() => handleGenerate(prompt || "Generate a welcome email")}
        isGenerating={isLoading}
      />

      <NewEmailModal
        isOpen={isNewEmailOpen}
        onClose={() => setIsNewEmailOpen(false)}
        onSelectOption={(opt) => {
          if (opt === "ai-prompt") {
            setPrompt("Generate an engaging email campaign for ");
          } else if (opt === "template") {
            setIsTemplatesOpen(true);
          }
        }}
      />

      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onSelectTemplate={(tplPrompt) => {
          setPrompt(tplPrompt);
          handleGenerate(tplPrompt);
        }}
      />

      <BrandKitModal isOpen={isBrandsOpen} onClose={() => setIsBrandsOpen(false)} />
    </div>
  );
}

export default App;
