import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ComparisonPane } from "../../src/components/ComparisonPane";
import type { ChatPane } from "../../src/types";

function TwoPanesTestHarness({
  initialPane1,
  initialPane2,
}: {
  initialPane1: ChatPane;
  initialPane2: ChatPane;
}) {
  const [pane1, setPane1] = useState(initialPane1);
  const [pane2, setPane2] = useState(initialPane2);

  return (
    <div>
      <button
        data-testid="add-pane2-content"
        onClick={() =>
          setPane2((p) => ({
            ...p,
            streamingContent: (p.streamingContent || "") + "\nMore tokens for pane 2...",
          }))
        }
      >
        Append Pane 2
      </button>
      <button
        data-testid="add-pane1-content"
        onClick={() =>
          setPane1((p) => ({
            ...p,
            streamingContent: (p.streamingContent || "") + "\nMore tokens for pane 1...",
          }))
        }
      >
        Append Pane 1
      </button>

      <div className="grid grid-cols-2 gap-4">
        <ComparisonPane
          pane={pane1}
          index={0}
          isFastestTtft={false}
          isMaxSpeed={false}
        />
        <ComparisonPane
          pane={pane2}
          index={1}
          isFastestTtft={false}
          isMaxSpeed={false}
        />
      </div>
    </div>
  );
}

describe("ComparisonPane Per-Pane Scroll Isolation", () => {
  const basePane1: ChatPane = {
    id: "p1",
    providerId: "openai",
    modelId: "gpt-4o",
    modelLabel: "GPT-4o",
    streaming: true,
    streamingContent: "Initial long content for pane 1\n".repeat(20),
    metrics: null,
  };

  const basePane2: ChatPane = {
    id: "p2",
    providerId: "anthropic",
    modelId: "claude-3-5-sonnet",
    modelLabel: "Claude 3.5 Sonnet",
    streaming: true,
    streamingContent: "Initial content for pane 2",
    metrics: null,
  };

  it("maintains isolated scroll state when pane 1 is scrolled up and pane 2 receives content", () => {
    render(<TwoPanesTestHarness initialPane1={basePane1} initialPane2={basePane2} />);

    const scrollPane1 = screen.getByTestId("pane-scroll-0");
    const scrollPane2 = screen.getByTestId("pane-scroll-1");

    // Mock scrollHeight, clientHeight, and scrollTop
    Object.defineProperty(scrollPane1, "scrollHeight", { configurable: true, value: 600 });
    Object.defineProperty(scrollPane1, "clientHeight", { configurable: true, value: 200 });
    scrollPane1.scrollTop = 400; // initially at bottom: 600 - 400 - 200 = 0

    Object.defineProperty(scrollPane2, "scrollHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollPane2, "clientHeight", { configurable: true, value: 200 });
    scrollPane2.scrollTop = 200;

    // Initially, neither pane shows the scroll-to-latest button
    expect(screen.queryByTestId("scroll-latest-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("scroll-latest-1")).not.toBeInTheDocument();

    // User scrolls Pane 1 up: scrollTop becomes 50, so distanceFromBottom = 600 - 50 - 200 = 350 (> 140px threshold)
    scrollPane1.scrollTop = 50;
    fireEvent.scroll(scrollPane1);

    // Pane 1 now shows its own floating "scroll to latest" button
    expect(screen.getByTestId("scroll-latest-0")).toBeInTheDocument();
    // Pane 2 does NOT show a button
    expect(screen.queryByTestId("scroll-latest-1")).not.toBeInTheDocument();

    // Now, new tokens arrive in Pane 2
    fireEvent.click(screen.getByTestId("add-pane2-content"));

    // Pane 1 MUST still be at scrollTop = 50 and still have its button (not force-scrolled to bottom!)
    expect(scrollPane1.scrollTop).toBe(50);
    expect(screen.getByTestId("scroll-latest-0")).toBeInTheDocument();
  });

  it("scrolls pane to bottom when the floating jump button is clicked", () => {
    render(<TwoPanesTestHarness initialPane1={basePane1} initialPane2={basePane2} />);

    const scrollPane1 = screen.getByTestId("pane-scroll-0");
    scrollPane1.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      if (typeof options === "object") {
        scrollPane1.scrollTop = options.top ?? scrollPane1.scrollTop;
      } else if (typeof options === "number") {
        scrollPane1.scrollTop = y ?? options;
      }
    });

    Object.defineProperty(scrollPane1, "scrollHeight", { configurable: true, value: 800 });
    Object.defineProperty(scrollPane1, "clientHeight", { configurable: true, value: 200 });

    // Scroll up
    scrollPane1.scrollTop = 100; // distanceFromBottom = 800 - 100 - 200 = 500 > 140
    fireEvent.scroll(scrollPane1);

    const button = screen.getByTestId("scroll-latest-0");
    expect(button).toBeInTheDocument();

    // Click floating button
    fireEvent.click(button);

    expect(scrollPane1.scrollTo).toHaveBeenCalledWith({
      top: 800,
      behavior: "smooth",
    });
    // Button should now be dismissed
    expect(screen.queryByTestId("scroll-latest-0")).not.toBeInTheDocument();
  });
});
