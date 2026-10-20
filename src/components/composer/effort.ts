/**
 * Reasoning-effort state for the composer.
 *
 * Effort is a presentation-only preference today: the chat API has no
 * reasoning-effort field, so the selection is persisted locally and shown in
 * the model pill and effort submenu. Nothing here changes what the server
 * receives.
 */

export type EffortLevel = "Low" | "Medium" | "High" | "Max";

export const EFFORT_LEVELS: readonly EffortLevel[] = ["Low", "Medium", "High", "Max"];

export const DEFAULT_EFFORT: EffortLevel = "High";

const EFFORTS_KEY = "rosa-composer-efforts";
const AUTO_KEY = "rosa-composer-auto";

export function modelKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);
}

export function readEfforts(): Record<string, EffortLevel> {
  try {
    const raw = localStorage.getItem(EFFORTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, EffortLevel> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isEffortLevel(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeEfforts(efforts: Record<string, EffortLevel>): void {
  try {
    localStorage.setItem(EFFORTS_KEY, JSON.stringify(efforts));
  } catch {
    /* storage unavailable — effort stays in memory for this session */
  }
}

export function readAutoRouting(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAutoRouting(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}
