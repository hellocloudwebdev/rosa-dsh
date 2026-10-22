import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ModelMenu } from "../../src/components/composer/ModelMenu";
import type { ModelWithProvider } from "@shared/types";

function model(providerId: string, modelId: string, displayName: string): ModelWithProvider {
  return {
    id: `${providerId}-${modelId}`,
    providerId,
    modelId,
    displayName,
    description: null,
    contextWindow: 128_000,
    maxOutputTokens: null,
    capabilities: {},
    sources: {
      contextWindow: "provider",
      maxOutputTokens: "provider",
      description: "provider",
      capabilities: "provider",
    },
    discoveredAt: 0,
    verified: true,
    favourite: true,
    pinned: false,
    provider: {
      id: providerId,
      displayName: "OpenRouter",
      kind: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      connectionStatus: "ok",
    },
  } as unknown as ModelWithProvider;
}

const MODELS = [
  model("p1", "aion-1.0-mini", "AionLabs: Aion-1.0-Mini"),
  model("p1", "nova-lite", "Amazon: Nova Lite 1.0"),
  model(
    "p1",
    "devstral",
    "Mistral: Devstral Small 1.1 (free) — long-context instruction-tuned coding model",
  ),
];

function renderMenu({
  open = true,
  auto = false,
  selectedModel = { providerId: "p1", modelId: "aion-1.0-mini" },
  onSelectModel = vi.fn(),
}: {
  open?: boolean;
  auto?: boolean;
  selectedModel?: { providerId: string; modelId: string } | null;
  onSelectModel?: (m: { providerId: string; modelId: string; label?: string }) => void;
} = {}) {
  render(
    <ModelMenu
      models={MODELS}
      selectedModel={selectedModel}
      onSelectModel={onSelectModel}
      onOpenProvidersModal={() => undefined}
      onToggleFavourite={() => undefined}
      efforts={{}}
      onSelectEffort={() => undefined}
      auto={auto}
      onAutoChange={() => undefined}
      open={open}
      onOpenChange={() => undefined}
      theme="light"
    />,
  );
  return { onSelectModel };
}

// The trigger pill repeats the selected model's name, so row lookups stay
// inside the catalogue list.
const listbox = () => screen.getByRole("listbox", { name: "Models" });
const rowFor = (name: string) =>
  within(listbox()).getByText(name).closest(".model-row") as HTMLElement;
const rows = () => document.querySelectorAll<HTMLElement>(".model-row");

describe("ModelMenu catalogue", () => {
  it("renders each model's complete display name instead of a truncated label", () => {
    renderMenu();

    for (const m of MODELS) {
      const row = rowFor(m.displayName);
      expect(row).toBeInTheDocument();
      expect(row.textContent).toContain(m.displayName);
      // The name cell must be free to wrap; an ellipsis would hide the tail.
      expect(row.querySelector(".truncate")).toBeNull();
    }
  });

  it("walks the list with the arrow keys and selects with Enter", () => {
    const { onSelectModel } = renderMenu({ selectedModel: null });

    const items = rows();
    fireEvent.keyDown(items[0], { key: "ArrowDown" });

    // Nothing is active or selected, so the first row takes the highlight.
    expect(items[0].className).toContain("active-hover");
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1].className).toContain("active-hover");
    expect(items[0].className).not.toContain("active-hover");

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
    expect(onSelectModel).toHaveBeenCalledTimes(1);
    expect(onSelectModel).toHaveBeenCalledWith({
      providerId: "p1",
      modelId: "nova-lite",
      label: "Amazon: Nova Lite 1.0",
    });
  });

  it("starts from the current selection when arrowing down from rest", () => {
    renderMenu({ selectedModel: { providerId: "p1", modelId: "nova-lite" } });

    const items = rows();
    fireEvent.keyDown(items[0], { key: "ArrowDown" });

    // The selection is the second model, so one step down lands on the third.
    expect(items[2].className).toContain("active-hover");
  });

  it("keeps the caret in the search field while browsing with arrows", () => {
    renderMenu({ selectedModel: null });

    const search = screen.getByLabelText("Search models") as HTMLInputElement;
    search.focus();
    fireEvent.keyDown(search, { key: "ArrowDown" });

    expect(rows()[0].className).toContain("active-hover");
    expect(document.activeElement).toBe(search);
  });

  it("marks the list as a listbox and the selected row as selected", () => {
    renderMenu();

    expect(listbox()).toBeInTheDocument();
    const selected = rowFor("AionLabs: Aion-1.0-Mini");
    expect(selected).toHaveAttribute("role", "option");
    expect(selected).toHaveAttribute("aria-selected", "true");
  });

  it("filters the catalogue with the search field", () => {
    renderMenu();

    fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "nova" } });

    expect(within(listbox()).queryByText("AionLabs: Aion-1.0-Mini")).toBeNull();
    expect(within(listbox()).getByText("Amazon: Nova Lite 1.0")).toBeInTheDocument();
  });
});
