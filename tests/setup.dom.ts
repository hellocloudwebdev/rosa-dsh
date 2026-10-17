import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";

// jsdom ships crypto.randomUUID only on recent versions of the harness, and the
// client generates a request id per pane, so make sure it always exists.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

// React 19 does not need this, but jsdom lacks the observer APIs that
// Radix and the markdown renderer touch on mount.
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver !== "function") {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
}
