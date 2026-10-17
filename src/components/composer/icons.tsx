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

export function KimiIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="10" fill="#101114" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
      <text
        x="12"
        y="16.4"
        textAnchor="middle"
        fontSize="11.5"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="Inter, sans-serif"
      >
        K
      </text>
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

export function ModelIcon({
  type,
  className = "",
}: {
  type: "kimi" | "gpt" | "star";
  className?: string;
}) {
  if (type === "kimi") return <KimiIcon className={className} />;
  if (type === "gpt") return <GptIcon className={`${className} text-neutral-200`} />;
  return <StarburstIcon className={`${className} text-[#e0532f]`} />;
}
