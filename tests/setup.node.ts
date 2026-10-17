import { webcrypto } from "node:crypto";

// Vitest's node environment lacks `crypto.randomUUID` on older harnesses and
// lacks structuredClone in some node versions; normalise both.
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

if (typeof globalThis.structuredClone !== "function") {
  (globalThis as { structuredClone?: (v: unknown) => unknown }).structuredClone = (
    value: unknown,
  ) => JSON.parse(JSON.stringify(value));
}

// jsdom-only setup file.
if (typeof document !== "undefined") {
  void import("@testing-library/jest-dom/vitest");
}
