import { useState } from "react";
import type { Action, AppState } from "../../state/appState.js";
import { cn } from "../../lib/cn.js";
import { Button } from "../ui/Button.js";
import { SparkIcon, CompareIcon, StarIcon } from "../ui/Icons.js";

export interface EmptyConversationProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

/** First-run / empty state for a single-model conversation. */
export function EmptyConversation({ state, dispatch }: EmptyConversationProps) {
  const [hint, setHint] = useState<string | null>(null);

  const suggestions = [
    {
      title: "Explain a trade-off",
      prompt:
        "Explain the trade-offs between optimistic and pessimistic concurrency control, with a concrete example of each.",
    },
    {
      title: "Debug a stack trace",
      prompt:
        "Here is a stack trace from a Node service under load. Summarise the likely root cause and the first three things you would check.\n\n<paste the trace>",
    },
    {
      title: "Compare two designs",
      prompt:
        "Compare a single-table and a normalised relational design for an event-sourced audit log.",
    },
  ];

  const favourites = state.models.filter((m) => m.favourite).slice(0, 4);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20">
          <SparkIcon size={22} />
        </span>
        <h2 className="text-[19px] font-semibold tracking-tight text-ink-strong">
          How can I help?
        </h2>
        <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
          Messages stream in real time. Switch to{" "}
          <button
            type="button"
            className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
            onClick={() => dispatch({ type: "mode/set", mode: "compare" })}
          >
            comparison
          </button>{" "}
          to send the same prompt to up to four models and compare them directly.
        </p>
      </div>

      {hint ? (
        <p className="mx-auto rounded-lg border border-state-info/30 bg-state-info-bg px-3 py-2 text-[12px] text-state-info-strong">
          {hint}
        </p>
      ) : null}

      {favourites.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Your favourites
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {favourites.map((model) => (
              <button
                key={`${model.providerId}:${model.modelId}`}
                type="button"
                onClick={() => {
                  dispatch({
                    type: "selection/model",
                    providerId: model.providerId,
                    modelId: model.modelId,
                  });
                  dispatch({
                    type: "pane/model",
                    paneId: state.panes[0]?.id ?? 1,
                    providerId: model.providerId,
                    modelId: model.modelId,
                    modelLabel: model.displayName,
                  });
                  setHint(`${model.displayName} selected for this conversation.`);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  state.selectedModelId === model.modelId &&
                    state.selectedProviderId === model.providerId
                    ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200"
                    : "border-line-subtle text-ink-muted hover:bg-surface-sunken hover:text-ink-strong",
                )}
              >
                <StarIcon size={11} />
                {model.displayName}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          Try one of these
        </h3>
        <ul className="flex flex-col gap-2">
          {suggestions.map((suggestion) => (
            <li key={suggestion.title}>
              <button
                type="button"
                onClick={() => {
                  const textarea = document.querySelector<HTMLTextAreaElement>("#composer");
                  if (textarea) {
                    textarea.value = suggestion.prompt;
                    textarea.dispatchEvent(new Event("input", { bubbles: true }));
                    textarea.focus();
                    return;
                  }
                  setHint("Focus the composer below and paste the prompt.");
                }}
                className="w-full rounded-xl border border-line-subtle bg-surface-raised px-3.5 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span className="block text-[13px] font-medium text-ink-strong">
                  {suggestion.title}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-ink-muted">
                  {suggestion.prompt}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-center pt-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => dispatch({ type: "mode/set", mode: state.mode === "compare" ? "single" : "compare" })}
        >
          <CompareIcon size={13} />
          {state.mode === "compare" ? "Back to single chat" : "Compare four models"}
        </Button>
      </div>
    </div>
  );
}
