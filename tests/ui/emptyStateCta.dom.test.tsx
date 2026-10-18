import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrimaryWorkspace } from "../../src/components/PrimaryWorkspace";
import type { ModelWithProvider } from "../../shared/types";

describe("PrimaryWorkspace Empty-State CTA", () => {
  const defaultProps = {
    messages: [],
    isLoading: false,
    prompt: "",
    onPromptChange: vi.fn(),
    onSubmit: vi.fn(),
    mode: "chat" as const,
    onModeChange: vi.fn(),
    selectedModel: null,
    onSelectModel: vi.fn(),
    paneCount: 1 as const,
    panes: [
      {
        id: 0,
        providerId: "openai",
        modelId: "gpt-4o",
        modelLabel: "GPT-4o",
        streaming: false,
        streamingContent: "",
        metrics: null,
        error: null,
      },
    ],
    onUpdatePaneModel: vi.fn(),
    temperature: 0.7,
    onTemperatureChange: vi.fn(),
    theme: "dark" as const,
  };

  it("renders a direct CTA to open Providers modal when no models are configured", () => {
    const onOpenProvidersModal = vi.fn();

    render(
      <PrimaryWorkspace
        {...defaultProps}
        models={[]}
        onOpenProvidersModal={onOpenProvidersModal}
      />,
    );

    const ctaCard = screen.getByTestId("no-models-cta-card");
    expect(ctaCard).toBeInTheDocument();
    expect(screen.getByText("No models configured")).toBeInTheDocument();

    const ctaButton = screen.getByTestId("configure-provider-cta");
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toHaveTextContent("Configure Provider & API Key");

    fireEvent.click(ctaButton);
    expect(onOpenProvidersModal).toHaveBeenCalledTimes(1);
  });

  it("does not render the CTA card when models are configured", () => {
    const onOpenProvidersModal = vi.fn();
    const mockModel: ModelWithProvider = {
      id: "gpt-4o",
      providerId: "prov-1",
      providerName: "OpenAI",
      providerKind: "openai",
      displayName: "GPT-4o",
      description: "Fast flagship model",
      contextWindow: 128000,
      maxOutputTokens: 4096,
      vision: true,
      tools: true,
      streaming: true,
      structuredOutput: true,
      ownedBy: "openai",
      inputModalities: ["text", "image"],
      source: "provider",
      isFavourite: false,
      isPinned: false,
    };

    render(
      <PrimaryWorkspace
        {...defaultProps}
        models={[mockModel]}
        selectedModel={{ providerId: "prov-1", modelId: "gpt-4o" }}
        onOpenProvidersModal={onOpenProvidersModal}
      />,
    );

    expect(screen.queryByTestId("no-models-cta-card")).not.toBeInTheDocument();
  });
});
