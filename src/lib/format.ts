/** Formatting helpers for the chat and metrics surfaces. */

export function formatRelativeTime(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp) return "";
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(timestamp);
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Day bucket used to group conversation history. */
export function dayBucket(timestamp: number, now = Date.now()): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const start = new Date(timestamp);
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfToday.getTime() - start.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 days";
  if (diffDays <= 30) return "Previous 30 days";
  return "Older";
}

export function formatTokens(count: number | null | undefined): string {
  if (count === null || count === undefined) return "unknown";
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const k = count / 1000;
    return `${k >= 10 ? Math.round(k) : round2(k)}k`;
  }
  const m = count / 1_000_000;
  return `${round2(m)}M`;
}

export function formatContextWindow(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) return "unknown";
  return `${formatTokens(tokens)} tokens`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${round2(ms / 1000)} s`;
}

export function formatTokensPerSecond(tps: number | null | undefined): string {
  if (tps === null || tps === undefined) return "—";
  return `${round2(tps)} tok/s`;
}

/** Truncate to a sensible length without cutting mid-word. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percent bar width from a context-window estimate. */
export function usagePercent(used: number | null, limit: number | null): number | null {
  if (used === null || limit === null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** Group items by bucket, preserving insertion order within a bucket. */
export function groupBy<T>(items: T[], key: (item: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return Array.from(map.entries());
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
