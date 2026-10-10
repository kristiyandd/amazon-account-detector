import { EXPECTED_MISSING_SUFFIX, WRONG_ACCOUNT_SUFFIX } from "@/core/copy";
import type { MarketplaceId } from "@/core/marketplaces";
import { OPTION_PREFIX, useMenu } from "../hooks/use-menu";
import { MarketplaceOption } from "./MarketplaceOption";
import type { MarketplaceEntry } from "../model";
import type { JSX, RefObject } from "preact";

const LIST_ID = "marketplace-list";

const ALERT_NAMES: ReadonlyMap<string, string> = new Map([
  ["mismatch", WRONG_ACCOUNT_SUFFIX],
  ["missing", EXPECTED_MISSING_SUFFIX],
]);

const CHEVRON = (
  <svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="m4 6 4 4 4-4"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

const MENU_FOOT = (
  <p class="menu-foot" aria-hidden="true">
    <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to choose, <kbd>Esc</kbd> to close
  </p>
);

interface MarketplaceMenuProps {
  readonly entries: readonly MarketplaceEntry[];
  readonly selected: MarketplaceId;
  readonly onSelect: (id: MarketplaceId) => void;
}

interface SwitchButtonProps {
  readonly current: MarketplaceEntry | undefined;
  readonly open: boolean;
  readonly buttonRef: RefObject<HTMLButtonElement>;
  readonly onToggle: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

function SwitchButton({
  current,
  open,
  buttonRef,
  onToggle,
  onKeyDown,
}: SwitchButtonProps): JSX.Element {
  const alertName = current === undefined ? undefined : ALERT_NAMES.get(current.match);
  return (
    <button
      ref={buttonRef}
      type="button"
      class="switch"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? LIST_ID : undefined}
      onClick={onToggle}
      onKeyDown={onKeyDown}
    >
      <span class="tile" aria-hidden="true">
        {current?.marketplace.code}
      </span>
      <span class="names">
        <span class="label">Marketplace</span>
        <span class="name">{current?.marketplace.label}</span>
      </span>
      {current?.overview.tone === "bad" ? <span class="dot bad" aria-hidden="true" /> : <span />}
      {alertName === undefined ? null : <span class="sr-only">{alertName}</span>}
      {CHEVRON}
    </button>
  );
}

interface MenuListProps {
  readonly entries: readonly MarketplaceEntry[];
  readonly selected: MarketplaceId;
  readonly active: number;
  readonly listRef: RefObject<HTMLUListElement>;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onClick: (event: MouseEvent) => void;
}

function MenuList({
  entries,
  selected,
  active,
  listRef,
  onKeyDown,
  onClick,
}: MenuListProps): JSX.Element {
  return (
    <div class="menu">
      <ul
        ref={listRef}
        id={LIST_ID}
        class="options"
        role="listbox"
        aria-label="Marketplace"
        tabIndex={-1}
        aria-activedescendant={`${OPTION_PREFIX}${entries[active]?.id ?? selected}`}
        onKeyDown={onKeyDown}
        onClick={onClick}
      >
        {entries.map((entry, index) => (
          <MarketplaceOption
            key={entry.id}
            entry={entry}
            selected={entry.id === selected}
            active={index === active}
          />
        ))}
      </ul>
      {MENU_FOOT}
    </div>
  );
}

export function MarketplaceMenu({
  entries,
  selected,
  onSelect,
}: MarketplaceMenuProps): JSX.Element {
  const { open, active, rootRef, buttonRef, listRef, ...handlers } = useMenu(
    entries,
    selected,
    onSelect,
  );
  const current = entries.find((entry) => entry.id === selected);
  return (
    <div class="picker" ref={rootRef}>
      <SwitchButton
        current={current}
        open={open}
        buttonRef={buttonRef}
        onToggle={handlers.toggle}
        onKeyDown={handlers.onButtonKeyDown}
      />
      {open ? (
        <MenuList
          entries={entries}
          selected={selected}
          active={active}
          listRef={listRef}
          onKeyDown={handlers.onListKeyDown}
          onClick={handlers.onListClick}
        />
      ) : null}
    </div>
  );
}
