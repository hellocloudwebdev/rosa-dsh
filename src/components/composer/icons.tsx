import { Bot, Sparkles, Cpu, Cloud, Zap } from "lucide-react";

export function StarburstIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      className={className}
    >
      {[0, 45, 90, 135].map((a) => (
        <line key={a} x1="12" y1="3.5" x2="12" y2="20.5" transform={`rotate(${a} 12 12)`} />
      ))}
    </svg>
  );
}

export function GptIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <ellipse cx="12" cy="12" rx="9" ry="3.8" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)" />
    </svg>
  );
}

export function AnthropicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <polygon points="12,2 22,20 17,20 12,10 7,20 2,20" />
    </svg>
  );
}

export function GoogleGeminiIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z" />
    </svg>
  );
}

export function OllamaIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <circle cx="15" cy="10" r="1.5" fill="currentColor" />
      <path d="M8 15h8" strokeLinecap="round" />
    </svg>
  );
}

export function ModelIcon({
  type,
  className = "",
}: {
  type?: string;
  className?: string;
}) {
  const t = (type || "").toLowerCase();
  if (t.includes("openai") || t.includes("gpt")) {
    return <GptIcon className={`${className} text-emerald-400`} />;
  }
  if (t.includes("anthropic") || t.includes("claude")) {
    return <AnthropicIcon className={`${className} text-amber-500`} />;
  }
  if (t.includes("google") || t.includes("gemini")) {
    return <GoogleGeminiIcon className={`${className} text-blue-400`} />;
  }
  if (t.includes("ollama") || t.includes("local") || t.includes("llama")) {
    return <OllamaIcon className={`${className} text-purple-400`} />;
  }
  if (t.includes("groq")) {
    return <Zap className={`${className} text-orange-400`} />;
  }
  if (t.includes("azure")) {
    return <Cloud className={`${className} text-sky-400`} />;
  }
  if (t.includes("mistral")) {
    return <Cpu className={`${className} text-amber-400`} />;
  }
  if (t.includes("deepseek")) {
    return <Bot className={`${className} text-cyan-400`} />;
  }
  if (t === "star") {
    return <StarburstIcon className={`${className} text-[var(--text-primary)]`} />;
  }
  return <Sparkles className={`${className} text-[var(--lime-badge)]`} />;
}

export function AceStudioIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <div
      className={`rounded-md bg-[#c6f232] flex items-center justify-center shrink-0 p-0.5 shadow-2xs ${className}`}
      aria-hidden="true"
    >
      <div className="w-full h-full rounded-full border border-black/30 flex overflow-hidden">
        <div className="w-1/2 h-full bg-neutral-900" />
        <div className="w-1/2 h-full bg-transparent" />
      </div>
    </div>
  );
}
