/**
 * Monochrome provider glyphs drawn for the composer's circular model badges.
 * They intentionally use `currentColor` so the badge owns the colour.
 */

export function CheckmarkIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      className="flex-shrink-0"
      style={{ color: "var(--text-primary)" }}
      aria-hidden="true"
    >
      <path
        d="M3.2 8.5L6.5 11.8L13 4.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OpenAiGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.2 10.1c.2-1.5-.2-3.1-1.2-4.3-1.3-1.6-3.4-2.3-5.4-1.8-.9-1.1-2.3-1.8-3.8-1.8-2.1 0-3.9 1.3-4.6 3.2-1.5.3-2.8 1.2-3.6 2.5-1 1.8-.9 4 .2 5.7-.2 1.5.2 3.1 1.2 4.3 1.3 1.6 3.4 2.3 5.4 1.8.9 1.1 2.3 1.8 3.8 1.8 2.1 0 3.9-1.3 4.6-3.2 1.5-.3 2.8-1.2 3.6-2.5 1.1-1.8 1-4-.2-5.7z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.45" />
    </svg>
  );
}

function AnthropicGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="6.4" y1="19.4" x2="13.2" y2="4.6" />
        <line x1="17.6" y1="19.4" x2="10.8" y2="4.6" />
        <line x1="9.1" y1="14.2" x2="15.6" y2="14.2" />
      </g>
    </svg>
  );
}

function GeminiGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.4c0 5.3 4.3 9.6 9.6 9.6-5.3 0-9.6 4.3-9.6 9.6 0-5.3-4.3-9.6-9.6-9.6 5.3 0 9.6-4.3 9.6-9.6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.35" strokeLinecap="round">
        <line x1="9" y1="2.2" x2="9" y2="15.8" />
        <line x1="2.2" y1="9" x2="15.8" y2="9" />
        <line x1="4.1" y1="4.1" x2="13.9" y2="13.9" />
        <line x1="13.9" y1="4.1" x2="4.1" y2="13.9" />
        <line x1="6.4" y1="2.7" x2="11.6" y2="15.3" />
        <line x1="2.7" y1="6.4" x2="15.3" y2="11.6" />
      </g>
      <circle cx="9" cy="9" r="1.4" fill="currentColor" />
    </svg>
  );
}

function BoltGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.1 1.8 3.4 9.1h3.7l-.9 5.1 5.7-7.3H8.2l.9-5.1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BarsGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="2.4" y1="4.2" x2="13.6" y2="4.2" />
        <line x1="2.4" y1="8" x2="11.2" y2="8" />
        <line x1="2.4" y1="11.8" x2="8.8" y2="11.8" />
      </g>
    </svg>
  );
}

/** Glyph for a provider kind, falling back to a neutral spark. */
export function ProviderBadgeIcon({ kind }: { kind?: string | null }) {
  const k = (kind ?? "").toLowerCase();
  if (k.includes("openai") || k.includes("azure")) return <OpenAiGlyph />;
  if (k.includes("anthropic")) return <AnthropicGlyph />;
  if (k.includes("google")) return <GeminiGlyph />;
  if (k.includes("groq")) return <BoltGlyph />;
  if (k.includes("mistral") || k.includes("cohere")) return <BarsGlyph />;
  return <SparkGlyph />;
}

/** Circular badge used in the model pill and every model row. */
export function ProviderBadge({ kind }: { kind?: string | null }) {
  const k = (kind ?? "").toLowerCase();
  // Aggregators keep the reference's coral accent so they stand apart.
  const color = k.includes("openrouter") || k.includes("gateway") ? "var(--accent-coral)" : "var(--badge-fg)";
  return (
    <span
      className="w-[26px] h-[26px] rounded-full flex items-center justify-center flex-shrink-0 border"
      style={{ background: "var(--badge-bg)", borderColor: "var(--badge-border)", color }}
    >
      <ProviderBadgeIcon kind={kind} />
    </span>
  );
}
