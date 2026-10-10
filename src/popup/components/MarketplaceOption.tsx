import { OPTION_PREFIX } from "../hooks/use-menu";
import type { MarketplaceEntry } from "../model";
import type { JSX } from "preact";

interface MarketplaceOptionProps {
  readonly entry: MarketplaceEntry;
  readonly selected: boolean;
  readonly active: boolean;
}

export function MarketplaceOption({
  entry,
  selected,
  active,
}: MarketplaceOptionProps): JSX.Element {
  const { overview } = entry;
  return (
    <li
      id={`${OPTION_PREFIX}${entry.id}`}
      role="option"
      aria-selected={selected}
      class={active ? "opt active" : "opt"}
    >
      <span class="code">{entry.marketplace.code}</span>
      <span class="body">
        <span class="site">{entry.marketplace.label}</span>
        <span class={overview.wrong ? "state bad" : "state"}>{overview.line}</span>
      </span>
      <span class="side">
        {overview.age === null ? null : (
          <span class={overview.stale ? "age stale" : "age"}>{overview.age}</span>
        )}
        <span class={`dot ${overview.tone}`} aria-hidden="true" />
      </span>
    </li>
  );
}
