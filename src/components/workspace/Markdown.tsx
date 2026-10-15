import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { cn } from "../../lib/cn.js";

export interface MarkdownProps {
  content: string;
  /** True while tokens are still arriving. */
  streaming?: boolean;
  className?: string;
}

/**
 * Markdown renderer for chat output.
 *
 * A small pre-processing step closes an unterminated fenced code block while
 * streaming so the code surface renders properly instead of swallowing the
 * rest of the message as literal text. That transform is intentionally
 * unclosed-block-only: it never changes finished content.
 */
export const Markdown = memo(function Markdown({ content, streaming = false, className }: MarkdownProps) {
  const rendered = useMemo(() => (streaming ? closeOpenCodeFence(content) : content), [content, streaming]);

  return (
    <div className={cn("prose-chat", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
          ),
          img: ({ node, ...props }) => (
            <img {...props} loading="lazy" decoding="async" className="max-w-full rounded-md" />
          ),
          pre: ({ node, ...props }) => (
            <pre {...props} className="code-block" />
          ),
          code: ({ node, className, children, ...props }) => {
            const isBlock = typeof className === "string" && className.includes("language-");
            if (isBlock) {
              return (
                <code {...props} className={cn("code-inline", className)}>
                  {children}
                </code>
              );
            }
            return (
              <code {...props} className="inline-code">
                {children}
              </code>
            );
          },
          table: ({ node, ...props }) => (
            <div className="table-scroll">
              <table {...props} />
            </div>
          ),
        }}
      >
        {rendered}
      </ReactMarkdown>
      {streaming ? <span className="stream-caret" aria-hidden="true" /> : null}
    </div>
  );
});

/**
 * If the model is mid-fence, append a closing fence so highlight.js sees a
 * complete block. Fences counted only outside inline code.
 */
function closeOpenCodeFence(text: string): string {
  const fenceCount = (text.match(/^```/gm) ?? []).length;
  if (fenceCount % 2 === 0) return text;
  // Also close an unterminated table/HTML-ish block only when it would break
  // rendering badly; markdown tolerates those, so we leave them alone.
  return `${text}\n\`\`\``;
}
