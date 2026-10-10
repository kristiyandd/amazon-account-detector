import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import * as v from "valibot";
import type { MarketplaceId } from "@/core/marketplaces";
import { MarketplaceIdSchema } from "@/core/state";
import type { MarketplaceEntry } from "../model";
import type { RefObject } from "preact";

export const OPTION_PREFIX = "marketplace-option-";

const LABEL_PREFIX = /^amazon\./u;

type Move = (index: number, count: number) => number;

const MOVES: ReadonlyMap<string, Move> = new Map<string, Move>([
  ["ArrowDown", (index, count) => (index + 1) % count],
  ["ArrowUp", (index, count) => (index - 1 + count) % count],
  ["Home", () => 0],
  ["End", (_index, count) => count - 1],
]);
const OPEN_KEYS: ReadonlySet<string> = new Set(["ArrowDown", "ArrowUp", "Enter"]);
const CHOOSE_KEYS: ReadonlySet<string> = new Set(["Enter", " "]);
const CLOSE_KEYS: ReadonlySet<string> = new Set(["Escape", "Tab"]);

export interface MenuControls {
  readonly open: boolean;
  readonly active: number;
  readonly rootRef: RefObject<HTMLDivElement>;
  readonly buttonRef: RefObject<HTMLButtonElement>;
  readonly listRef: RefObject<HTMLUListElement>;
  readonly toggle: () => void;
  readonly onButtonKeyDown: (event: KeyboardEvent) => void;
  readonly onListKeyDown: (event: KeyboardEvent) => void;
  readonly onListClick: (event: MouseEvent) => void;
}

function startsWith(entry: MarketplaceEntry, letter: string): boolean {
  const site = entry.marketplace.label.toLowerCase().replace(LABEL_PREFIX, "");
  return entry.marketplace.code.toLowerCase().startsWith(letter) || site.startsWith(letter);
}

function letterTarget(
  entries: readonly MarketplaceEntry[],
  from: number,
  letter: string,
): number | null {
  const order = entries.map((_entry, step) => (from + 1 + step) % entries.length);
  const found = order.find((index) => {
    const entry = entries[index];
    return entry !== undefined && startsWith(entry, letter);
  });
  return found ?? null;
}

function nextActive(
  key: string,
  active: number,
  entries: readonly MarketplaceEntry[],
): number | null {
  const move = MOVES.get(key);
  if (move !== undefined) {
    return move(active, entries.length);
  }
  return key.length === 1 ? letterTarget(entries, active, key.toLowerCase()) : null;
}

function optionIdOf(target: EventTarget | null): MarketplaceId | null {
  const option = target instanceof Element ? target.closest("[role='option']") : null;
  const parsed = v.safeParse(MarketplaceIdSchema, option?.id.replace(OPTION_PREFIX, ""));
  return parsed.success ? parsed.output : null;
}

function useOutsideClose(
  open: boolean,
  rootRef: RefObject<HTMLDivElement>,
  setOpen: (open: boolean) => void,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: Event): void => {
      const inside = event.target instanceof Node && rootRef.current?.contains(event.target);
      if (inside !== true) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, rootRef, setOpen]);
}

interface ListHandlers {
  readonly onListKeyDown: (event: KeyboardEvent) => void;
  readonly onListClick: (event: MouseEvent) => void;
}

function useListHandlers(
  entries: readonly MarketplaceEntry[],
  active: number,
  actions: {
    readonly choose: (id: MarketplaceId) => void;
    readonly close: () => void;
    readonly setActive: (index: number) => void;
  },
): ListHandlers {
  const { choose, close, setActive } = actions;
  const onListKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      const entry = entries[active];
      if (CHOOSE_KEYS.has(event.key) || CLOSE_KEYS.has(event.key)) {
        event.preventDefault();
        if (CHOOSE_KEYS.has(event.key) && entry !== undefined) {
          choose(entry.id);
        } else {
          close();
        }
        return;
      }
      const next = nextActive(event.key, active, entries);
      if (next !== null) {
        event.preventDefault();
        setActive(next);
      }
    },
    [active, entries, choose, close, setActive],
  );
  const onListClick = useCallback(
    (event: MouseEvent): void => {
      const id = optionIdOf(event.target);
      if (id !== null) {
        choose(id);
      }
    },
    [choose],
  );
  return { onListKeyDown, onListClick };
}

export function useMenu(
  entries: readonly MarketplaceEntry[],
  selected: MarketplaceId,
  onSelect: (id: MarketplaceId) => void,
): MenuControls {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === selected),
  );
  useOutsideClose(open, rootRef, setOpen);
  useEffect(() => {
    if (open) {
      listRef.current?.focus();
    }
  }, [open]);
  const show = useCallback((): void => {
    setActive(selectedIndex);
    setOpen(true);
  }, [selectedIndex]);
  const close = useCallback((): void => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);
  const choose = useCallback(
    (id: MarketplaceId): void => {
      close();
      onSelect(id);
    },
    [close, onSelect],
  );
  const toggle = useCallback((): void => {
    if (open) {
      setOpen(false);
    } else {
      show();
    }
  }, [open, show]);
  const onButtonKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (!open && OPEN_KEYS.has(event.key)) {
        event.preventDefault();
        show();
      }
    },
    [open, show],
  );
  const list = useListHandlers(entries, active, { choose, close, setActive });
  return { open, active, rootRef, buttonRef, listRef, toggle, onButtonKeyDown, ...list };
}
