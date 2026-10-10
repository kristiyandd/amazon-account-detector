import { summaryText } from "@/core/overview";
import type { MarketplaceEntry } from "../model";
import type { JSX } from "preact";

interface SummaryProps {
  readonly entries: readonly MarketplaceEntry[];
}

export function Summary({ entries }: SummaryProps): JSX.Element {
  return (
    <p class="summary">
      <span>{summaryText(entries.map((entry) => entry.overview))}</span>
      <span class="dots" aria-hidden="true">
        {entries.map((entry) => (
          <span key={entry.id} class={`dot ${entry.overview.tone}`} />
        ))}
      </span>
    </p>
  );
}
