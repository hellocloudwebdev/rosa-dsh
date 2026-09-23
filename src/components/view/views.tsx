import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Copy,
  File,
  FileText,
  Folder,
  FolderTree,
  GitCompare,
  Globe,
  Image as ImageIcon,
  Lock,
  Mail,
  RotateCw,
  Terminal,
} from "lucide-react";
import type { GeneratedEmail, ViewType } from "../../types";
import { AcmeLogo } from "../icons/AcmeLogo";

export interface ViewProps {
  email: GeneratedEmail;
  onEmailChange: (e: GeneratedEmail) => void;
  previousEmail: GeneratedEmail | null;
  engine: string;
  isLoading: boolean;
}

export const VIEW_LIST: { type: ViewType; label: string; icon: ReactNode }[] = [
  { type: "email", label: "Email Preview", icon: <Mail className="w-3.5 h-3.5" /> },
  { type: "browser", label: "Browser", icon: <Globe className="w-3.5 h-3.5" /> },
  { type: "code", label: "Code", icon: <Code2 className="w-3.5 h-3.5" /> },
  { type: "markdown", label: "Markdown", icon: <FileText className="w-3.5 h-3.5" /> },
  { type: "pdf", label: "PDF", icon: <File className="w-3.5 h-3.5" /> },
  { type: "image", label: "Image", icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { type: "diff", label: "Diff", icon: <GitCompare className="w-3.5 h-3.5" /> },
  { type: "terminal", label: "Terminal", icon: <Terminal className="w-3.5 h-3.5" /> },
  { type: "project", label: "Project", icon: <FolderTree className="w-3.5 h-3.5" /> },
];

export function viewMeta(t: ViewType) {
  return VIEW_LIST.find((v) => v.type === t) ?? VIEW_LIST[0];
}

function buildHtml(email: GeneratedEmail): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${email.subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8f8f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; border: 1px solid #e5e5e5; overflow: hidden; }
    .btn { display: inline-block; padding: 14px 28px; background: #111111; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px; }
    .footer { padding: 32px; background: #fafaf9; text-align: center; font-size: 12px; color: #888888; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header" style="padding: 32px; border-bottom: 1px solid #f0f0f0;"><strong>ACME GLOBAL</strong></div>
    <div class="content" style="padding: 40px 32px;">
      <h1>${email.headline}</h1>
      ${email.body.map((p) => `<p>${p}</p>`).join("\n      ")}
      <p style="margin-top: 32px;"><a href="${email.ctaLink}" class="btn">${email.ctaText}</a></p>
    </div>
    <div class="footer"><p>© 2026 Acme AI Inc. All rights reserved.</p></div>
  </div>
</body>
</html>`;
}

/* ---------- Shared email "paper" (always renders as a white document) ---------- */

function EmailPaper({
  email,
  onEmailChange,
  editable = false,
}: {
  email: GeneratedEmail;
  onEmailChange?: (e: GeneratedEmail) => void;
  editable?: boolean;
}) {
  return (
    <div className="bg-white text-neutral-900 rounded-xl border border-black/10 shadow-md p-7 sm:p-9">
      <div className="flex items-center justify-between pb-5 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-neutral-950 text-white flex items-center justify-center">
            <AcmeLogo className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider">Acme Global</span>
        </div>
        <span className="text-[11px] text-neutral-400">Online version</span>
      </div>

      {editable && onEmailChange ? (
        <textarea
          rows={2}
          value={email.headline}
          onChange={(e) => onEmailChange({ ...email, headline: e.target.value })}
          className="w-full pt-6 pb-4 text-2xl font-bold tracking-tight leading-snug bg-transparent resize-none outline-none hover:bg-black/5 rounded p-1 transition-colors"
        />
      ) : (
        <h2 className="pt-6 pb-4 text-2xl font-bold tracking-tight leading-snug">{email.headline}</h2>
      )}

      <div className="space-y-4 text-[14.5px] leading-relaxed text-neutral-700">
        {email.body.map((para, i) =>
          editable && onEmailChange ? (
            <textarea
              key={i}
              rows={3}
              value={para}
              onChange={(e) => {
                const body = [...email.body];
                body[i] = e.target.value;
                onEmailChange({ ...email, body });
              }}
              className="w-full bg-transparent resize-none outline-none hover:bg-black/5 rounded p-1 transition-colors"
            />
          ) : (
            <p key={i}>{para}</p>
          )
        )}
      </div>

      <div className="pt-5 pb-6">
        <a
          href={email.ctaLink}
          onClick={(e) => e.preventDefault()}
          className="inline-block px-6 py-3 bg-neutral-950 text-white text-sm font-semibold rounded-xl hover:bg-neutral-800 transition-colors"
        >
          {email.ctaText}
        </a>
      </div>

      <div className="pt-6 border-t border-neutral-100 text-center text-xs text-neutral-400 space-y-1">
        <p>© 2026 Acme AI, Inc. • 548 Market St, San Francisco, CA</p>
        <p>
          You are receiving this because you signed up for Acme updates.{" "}
          <span className="underline cursor-pointer">Unsubscribe</span> •{" "}
          <span className="underline cursor-pointer">Preferences</span>
        </p>
      </div>
    </div>
  );
}

/* ---------- Views ---------- */

export function EmailPreviewView({ email, onEmailChange }: ViewProps) {
  return (
    <div className="space-y-0 max-w-[620px] mx-auto">
      <div className="bg-[var(--bg-panel-2)] rounded-t-xl border border-[var(--border-strong)] p-3.5 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
          <span className="font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--lime-text)]" />
            Inbox Client Preview
          </span>
          <span>
            To: <strong className="text-[var(--text-secondary)]">sarah@example.com</strong>
          </span>
        </div>
        <div className="flex items-start gap-2 pt-0.5">
          <span className="text-xs font-semibold text-[var(--text-muted)] w-16 shrink-0 pt-0.5">Subject:</span>
          <input
            type="text"
            value={email.subject}
            onChange={(e) => onEmailChange({ ...email, subject: e.target.value })}
            className="w-full text-xs font-medium text-[var(--text-primary)] bg-transparent outline-none hover:bg-[var(--hover-overlay)] px-1 py-0.5 rounded transition-colors"
          />
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xs font-semibold text-[var(--text-muted)] w-16 shrink-0 pt-0.5">Preheader:</span>
          <input
            type="text"
            value={email.previewText}
            onChange={(e) => onEmailChange({ ...email, previewText: e.target.value })}
            className="w-full text-xs text-[var(--text-secondary)] bg-transparent outline-none hover:bg-[var(--hover-overlay)] px-1 py-0.5 rounded transition-colors"
          />
        </div>
      </div>
      <EmailPaper email={email} onEmailChange={onEmailChange} editable />
    </div>
  );
}

export function BrowserView({ email }: ViewProps) {
  return (
    <div className="max-w-[640px] mx-auto">
      <div className="bg-[var(--bg-panel-2)] rounded-t-xl border border-b-0 border-[var(--border-strong)]">
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 border-b border-[var(--border-subtle)]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <ArrowLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <RotateCw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <div className="flex-1 flex items-center gap-1.5 bg-[var(--hover-overlay)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-secondary)]">
            <Lock className="w-3 h-3 text-[var(--lime-text)]" />
            <span className="truncate">acme.ai/inbox/preview/q4-onboarding</span>
          </div>
        </div>
      </div>
      <div className="rounded-b-xl border border-t-0 border-[var(--border-strong)] bg-[var(--bg-app)] p-5">
        <EmailPaper email={email} />
      </div>
    </div>
  );
}

export function CodeView({ email }: ViewProps) {
  const [copied, setCopied] = useState(false);
  const html = buildHtml(email);

  return (
    <div className="max-w-[760px] mx-auto">
      <div className="flex items-center justify-between pb-3 mb-3">
        <span className="text-xs text-[var(--text-muted)] font-mono">email-template.html · UTF-8</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(html);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[var(--border-strong)] bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] rounded-lg text-[var(--text-secondary)] transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-[var(--lime-text)]" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied" : "Copy HTML"}</span>
        </button>
      </div>
      <pre className="bg-[#151b16] text-neutral-200 rounded-xl p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto border border-white/10">
        {html}
      </pre>
    </div>
  );
}

function renderInline(text: string): ReactNode[] {
  const tokens = text.match(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  if (!tokens) return [text];

  const parts: ReactNode[] = [];
  let rest = text;
  let k = 0;
  tokens.forEach((tok) => {
    const idx = rest.indexOf(tok);
    if (idx > 0) parts.push(rest.slice(0, idx));
    if (tok.startsWith("**")) {
      parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    } else {
      const link = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (link)
        parts.push(
          <span key={k++} className="text-[var(--lime-text)] underline">
            {link[1]}
          </span>
        );
    }
    rest = rest.slice(idx + tok.length);
  });
  if (rest) parts.push(rest);
  return parts;
}

function MarkdownBlock({ md }: { md: string }) {
  return (
    <div className="space-y-2">
      {md.split("\n").map((ln, i) => {
        if (ln.startsWith("## "))
          return (
            <h3 key={i} className="text-base font-semibold text-[var(--text-primary)] pt-2">
              {renderInline(ln.slice(3))}
            </h3>
          );
        if (ln.startsWith("# "))
          return (
            <h2 key={i} className="text-xl font-bold text-[var(--text-primary)]">
              {renderInline(ln.slice(2))}
            </h2>
          );
        if (ln.startsWith("- "))
          return (
            <div key={i} className="flex gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
              <span className="text-[var(--lime-text)]">•</span>
              <span>{renderInline(ln.slice(2))}</span>
            </div>
          );
        if (!ln.trim()) return <div key={i} className="h-1.5" />;
        return (
          <p key={i} className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {renderInline(ln)}
          </p>
        );
      })}
    </div>
  );
}

export function MarkdownView({ email, engine }: ViewProps) {
  const mdLines: string[] = [
    "# Campaign Brief",
    "**Engine:** " + engine + " · **Audience:** 48.2k subscribers · **Deliverability:** 98/100",
    "",
    "## Preheader",
    email.previewText,
    "",
    "## Headline",
    email.headline,
    "",
    "## Key Points",
    ...email.body.map((p) => "- " + p),
    "",
    "## Call to Action",
    "[" + email.ctaText + "](" + email.ctaLink + ")",
  ];
  const md = mdLines.join("\n");

  return (
    <div className="max-w-[640px] mx-auto bg-[var(--bg-panel-2)] rounded-xl border border-[var(--border-strong)] p-6">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] pb-3 mb-4 border-b border-[var(--border-subtle)]">
        campaign-brief.md
      </div>
      <MarkdownBlock md={md} />
    </div>
  );
}

export function PdfView({ email }: ViewProps) {
  return (
    <div className="max-w-[620px] mx-auto">
      <div className="bg-white text-neutral-900 rounded-sm shadow-xl border border-black/10 px-10 py-12 min-h-[780px]">
        <div className="flex items-center gap-2 pb-6 border-b border-neutral-200">
          <div className="w-6 h-6 rounded-md bg-neutral-950 text-white flex items-center justify-center">
            <AcmeLogo className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider">Acme Global</span>
        </div>
        <h1 className="pt-8 text-[22px] font-bold leading-snug tracking-tight">{email.headline}</h1>
        <div className="pt-5 space-y-4 text-[13.5px] leading-relaxed text-neutral-700">
          {email.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="pt-8">
          <span className="inline-block px-5 py-2.5 bg-neutral-950 text-white text-xs font-semibold rounded-lg">
            {email.ctaText}
          </span>
        </div>
        <p className="pt-10 text-[10px] text-neutral-400 text-center">
          © 2026 Acme AI, Inc. • Prepared with Ace Studio
        </p>
      </div>
      <p className="text-center text-[11px] text-[var(--text-muted)] mt-3">Page 1 of 1</p>
    </div>
  );
}

export function ImageView(_: ViewProps) {
  return (
    <div className="max-w-[620px] mx-auto space-y-3">
      <div
        className="relative rounded-xl h-52 overflow-hidden border border-[var(--border-strong)]"
        style={{ background: "linear-gradient(135deg, #1d221e 0%, #2f4d3b 55%, #558766 100%)" }}
      >
        <AcmeLogo className="absolute inset-0 m-auto w-16 h-16 text-white/25" />
        <span className="absolute bottom-2.5 left-3 text-[11px] text-white/70 font-mono">
          hero-banner@2x.png · 1024×512
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { name: "logo-mark.png", bg: "linear-gradient(135deg, #2c342d, #558766)" },
          { name: "cta-banner.png", bg: "linear-gradient(135deg, #4f7f61, #8cd6a5)" },
          { name: "brand-pattern.png", bg: "linear-gradient(135deg, #1d221e, #4f7f61)" },
        ].map((t) => (
          <div
            key={t.name}
            className="relative rounded-lg h-24 overflow-hidden border border-[var(--border-strong)]"
            style={{ background: t.bg }}
          >
            <AcmeLogo className="absolute inset-0 m-auto w-6 h-6 text-white/30" />
            <span className="absolute bottom-1.5 left-2 text-[10px] text-white/70 font-mono">{t.name}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--text-muted)] px-1">
        Brand assets generated by Ace Studio — click a tile in the full app to download.
      </p>
    </div>
  );
}

export function DiffView({ email, previousEmail }: ViewProps) {
  if (!previousEmail) {
    return (
      <div className="max-w-[560px] mx-auto text-center py-20 space-y-2">
        <GitCompare className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-secondary)]">No diff yet.</p>
        <p className="text-xs text-[var(--text-muted)]">
          Generate a second draft and the changes against the previous one will appear here.
        </p>
      </div>
    );
  }

  const rows: { t: "del" | "add"; s: string }[] = [];
  const fields: [string, string, string][] = [
    ["Subject", previousEmail.subject, email.subject],
    ["Preheader", previousEmail.previewText, email.previewText],
    ["Headline", previousEmail.headline, email.headline],
    ["CTA", previousEmail.ctaText, email.ctaText],
  ];
  fields.forEach(([label, o, n]) => {
    if (o !== n) {
      rows.push({ t: "del", s: label + ": " + o });
      rows.push({ t: "add", s: label + ": " + n });
    }
  });
  const maxBody = Math.max(previousEmail.body.length, email.body.length);
  for (let i = 0; i < maxBody; i++) {
    const o = previousEmail.body[i] ?? "";
    const n = email.body[i] ?? "";
    if (o !== n) {
      if (o) rows.push({ t: "del", s: "¶ " + o });
      if (n) rows.push({ t: "add", s: "¶ " + n });
    }
  }

  return (
    <div className="max-w-[680px] mx-auto">
      <div className="flex items-center justify-between pb-3">
        <span className="text-xs text-[var(--text-muted)] font-mono">previous draft → current draft</span>
        <span className="text-[11px] text-[var(--lime-text)] font-medium">
          {rows.filter((r) => r.t === "add").length} additions ·{" "}
          {rows.filter((r) => r.t === "del").length} deletions
        </span>
      </div>
      <div className="rounded-xl border border-[var(--border-strong)] overflow-hidden font-mono text-xs">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[var(--text-muted)] bg-[var(--bg-panel-2)]">
            No textual changes between drafts.
          </div>
        ) : (
          rows.map((r, i) => (
            <div
              key={i}
              className={`flex gap-2.5 px-3.5 py-2 leading-relaxed border-b border-[var(--border-subtle)] last:border-0 ${
                r.t === "add" ? "bg-[#558766]/15 text-[#8cd6a5]" : "bg-red-500/10 text-[#e5726f]"
              }`}
            >
              <span className="shrink-0 select-none">{r.t === "add" ? "+" : "−"}</span>
              <span className="whitespace-pre-wrap break-words">{r.s}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function TerminalView({ email, engine, isLoading }: ViewProps) {
  const truncatedSubject = email.subject.slice(0, 52) + (email.subject.length > 52 ? "…" : "");
  const lines: { s: string; c?: string }[] = [
    { s: "❯ ace generate · model: " + engine + " · tone: persuasive", c: "text-neutral-100" },
    { s: "✓ Context loaded — brand: Acme Global · audience: 48,214 subscribers", c: "text-[#8cd6a5]" },
    { s: "✓ Drafted 12 subject lines — top score 9.4/10", c: "text-[#8cd6a5]" },
    { s: "✓ Spam filter scan — 0 flags", c: "text-[#8cd6a5]" },
    { s: "✓ Deliverability index: 98/100 (Grade A+)", c: "text-[#8cd6a5]" },
    { s: "✔ Draft ready — " + truncatedSubject, c: "text-neutral-100" },
  ];

  return (
    <div className="max-w-[680px] mx-auto">
      <div className="bg-[#131a14] rounded-xl border border-white/10 p-4 font-mono text-xs leading-loose shadow-lg">
        <div className="flex items-center gap-1.5 pb-2.5 mb-2 border-b border-white/5 text-[11px] text-neutral-500">
          <Terminal className="w-3.5 h-3.5" />
          ace-agent — session log
        </div>
        {lines.map((l, i) => (
          <div key={i} className={l.c ?? ""}>
            {l.s}
          </div>
        ))}
        {isLoading && <div className="text-[#8cd6a5]">… generating with {engine} ▍</div>}
        {!isLoading && <div className="text-neutral-500 animate-pulse">▍</div>}
      </div>
    </div>
  );
}

const TREE: { d: number; n: string; k: "dir" | "file" }[] = [
  { d: 0, n: "acme-ai/", k: "dir" },
  { d: 1, n: "src/", k: "dir" },
  { d: 2, n: "components/", k: "dir" },
  { d: 3, n: "composer/", k: "dir" },
  { d: 4, n: "Composer.tsx", k: "file" },
  { d: 4, n: "ModelMenu.tsx", k: "file" },
  { d: 4, n: "ModeMenu.tsx", k: "file" },
  { d: 4, n: "HoverExpand.tsx", k: "file" },
  { d: 4, n: "UpgradeBanner.tsx", k: "file" },
  { d: 4, n: "icons.tsx", k: "file" },
  { d: 3, n: "icons/", k: "dir" },
  { d: 4, n: "AcmeLogo.tsx", k: "file" },
  { d: 4, n: "AceMoonIcon.tsx", k: "file" },
  { d: 4, n: "SidebarIcons.tsx", k: "file" },
  { d: 3, n: "view/", k: "dir" },
  { d: 4, n: "ViewPanel.tsx", k: "file" },
  { d: 4, n: "views.tsx", k: "file" },
  { d: 3, n: "Sidebar.tsx", k: "file" },
  { d: 3, n: "StudioHeader.tsx", k: "file" },
  { d: 3, n: "PrimaryWorkspace.tsx", k: "file" },
  { d: 3, n: "SuggestedList.tsx", k: "file" },
  { d: 3, n: "NewEmailModal.tsx", k: "file" },
  { d: 3, n: "TemplatesModal.tsx", k: "file" },
  { d: 3, n: "BrandKitModal.tsx", k: "file" },
  { d: 3, n: "EmailPreviewModal.tsx", k: "file" },
  { d: 2, n: "types/index.ts", k: "file" },
  { d: 2, n: "App.tsx", k: "file" },
  { d: 2, n: "main.tsx", k: "file" },
  { d: 2, n: "index.css", k: "file" },
  { d: 1, n: "src-tauri/", k: "dir" },
  { d: 2, n: "src/main.rs", k: "file" },
  { d: 2, n: "src/lib.rs", k: "file" },
  { d: 2, n: "tauri.conf.json", k: "file" },
  { d: 2, n: "Cargo.toml", k: "file" },
  { d: 1, n: "index.html", k: "file" },
  { d: 1, n: "vite.config.ts", k: "file" },
  { d: 1, n: "tailwind.config.js", k: "file" },
  { d: 1, n: "package.json", k: "file" },
];

export function ProjectView(_: ViewProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="max-w-[560px] mx-auto bg-[var(--bg-panel-2)] rounded-xl border border-[var(--border-strong)] p-2">
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)] mb-1">
        <FolderTree className="w-3.5 h-3.5" />
        Project Files
      </div>
      {TREE.map((row) => (
        <button
          key={row.d + "-" + row.n}
          onClick={() => setSelected(row.d + "-" + row.n)}
          style={{ paddingLeft: 8 + row.d * 18 }}
          className={`w-full flex items-center gap-2 py-1.5 pr-2 rounded-md text-[13px] transition-colors cursor-pointer text-left ${
            selected === row.d + "-" + row.n
              ? "bg-[var(--active-overlay)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)] hover:text-[var(--text-primary)]"
          }`}
        >
          {row.k === "dir" ? (
            <Folder className="w-3.5 h-3.5 text-[var(--lime-text)] shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          )}
          <span className="truncate font-mono">{row.n}</span>
        </button>
      ))}
    </div>
  );
}
