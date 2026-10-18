import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { Check, Copy, Code2 } from "lucide-react";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  ts: "TypeScript",
  typescript: "TypeScript",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "React JSX",
  tsx: "React TSX",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  golang: "Go",
  json: "JSON",
  sql: "SQL",
  bash: "Bash",
  sh: "Shell",
  html: "HTML",
  css: "CSS",
  md: "Markdown",
  markdown: "Markdown",
  yaml: "YAML",
  yml: "YAML",
};

export function MarkdownMessage({ content, className = "" }: MarkdownMessageProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";
            const isInline = !match && !String(children).includes("\n");

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded text-[13px] font-mono bg-neutral-200/80 dark:bg-black/40 text-emerald-600 dark:text-[var(--lime-text)] border border-neutral-300 dark:border-white/10"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={language} code={String(children).replace(/\n$/, "")} />
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 border border-neutral-300 dark:border-[var(--border-strong)] rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border-b border-neutral-300 dark:border-[var(--border-strong)] bg-neutral-100 dark:bg-[var(--bg-panel-2)] px-3 py-2 font-semibold text-neutral-900 dark:text-neutral-100">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-b border-neutral-200 dark:border-[var(--border-subtle)] px-3 py-2 text-neutral-800 dark:text-neutral-200">
                {children}
              </td>
            );
          },
          p({ children }) {
            return <p className="mb-2.5 last:mb-0 text-neutral-800 dark:text-neutral-200">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2 space-y-1 text-neutral-800 dark:text-neutral-200">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-2 space-y-1 text-neutral-800 dark:text-neutral-200">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-[var(--lime)] pl-3 my-2 text-neutral-600 dark:text-[var(--text-secondary)] italic">
                {children}
              </blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = code.split("\n").length;
  const langKey = (language || "").toLowerCase();
  const label = LANGUAGE_LABELS[langKey] || language || "Code";

  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-neutral-300 dark:border-white/10 bg-[#121613] shadow-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#181f19] border-b border-white/5 text-[11px] font-mono text-neutral-400">
        <span className="flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5 text-[var(--lime-text)]" />
          <span className="font-semibold text-neutral-300">{label}</span>
          <span className="text-[10px] text-neutral-500">({lineCount} {lineCount === 1 ? "line" : "lines"})</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 text-xs font-mono overflow-x-auto leading-relaxed text-neutral-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}
