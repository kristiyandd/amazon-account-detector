import { useCallback, useState } from "preact/hooks";
import type { MatchStatus } from "@/core/expected";
import { MARKETPLACES } from "@/core/marketplaces";
import type { MarketplaceId } from "@/core/marketplaces";
import { describeStatus } from "@/core/view";
import { AccountCard } from "./components/AccountCard";
import { SHIELD_ICON } from "./components/icons";
import { MarketplaceMenu } from "./components/MarketplaceMenu";
import { Summary } from "./components/Summary";
import { useAccountState } from "./hooks/use-account-state";
import { useExpected } from "./hooks/use-expected";
import { buildEntries } from "./model";
import type { Snapshot } from "./api";
import type { PinFocus } from "./components/AccountCard";
import type { AccountView } from "./hooks/use-account-state";
import type { JSX } from "preact";

const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const REMOVED_NOTICE = "Expected account removed";

const FOOTER = (
  <p class="foot">
    {SHIELD_ICON}
    The extension never sends your email anywhere.
  </p>
);

function formatClock(timestamp: number): string {
  return CLOCK.format(timestamp);
}

function hasEmailHash(snapshot: Snapshot | null, id: MarketplaceId): boolean {
  return snapshot?.accounts.byMarketplace[id]?.emailHash !== undefined;
}

interface ActionsProps {
  readonly account: AccountView;
  readonly match: MatchStatus;
  readonly onExpectCurrent: () => void;
}

function Actions({ account, match, onExpectCurrent }: ActionsProps): JSX.Element {
  const waiting = account.cooldownSeconds > 0;
  return (
    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={account.checking || waiting}
        onClick={account.checkNow}
      >
        Check now
      </button>
      {waiting ? <p class="hint">{`Check again in ${String(account.cooldownSeconds)} s`}</p> : null}
      {match === "mismatch" ? (
        <button type="button" class="secondary" onClick={onExpectCurrent}>
          Expect this account instead
        </button>
      ) : null}
    </div>
  );
}

interface ExpectedControls {
  readonly notice: string | null;
  readonly pinFocus: PinFocus;
  readonly setCurrent: () => void;
  readonly expectCurrent: () => void;
  readonly clearCurrent: () => void;
  readonly onPinFocused: () => void;
  readonly clearNotice: () => void;
}

function useExpectedControls(
  selected: MarketplaceId,
  actions: ReturnType<typeof useExpected>,
): ExpectedControls {
  const { setExpected, clearExpected } = actions;
  const [notice, setNotice] = useState<string | null>(null);
  const [pinFocus, setPinFocus] = useState<PinFocus>(null);
  const setCurrent = useCallback((): void => {
    setNotice(null);
    setPinFocus("remove");
    setExpected(selected);
  }, [selected, setExpected]);
  const expectCurrent = useCallback((): void => {
    setNotice(null);
    setPinFocus("heading");
    setExpected(selected);
  }, [selected, setExpected]);
  const clearCurrent = useCallback((): void => {
    setNotice(REMOVED_NOTICE);
    setPinFocus("heading");
    clearExpected(selected);
  }, [selected, clearExpected]);
  const onPinFocused = useCallback((): void => {
    setPinFocus(null);
  }, []);
  const clearNotice = useCallback((): void => {
    setNotice(null);
  }, []);
  return { notice, pinFocus, setCurrent, expectCurrent, clearCurrent, onPinFocused, clearNotice };
}

export function App(): JSX.Element {
  const account = useAccountState();
  const { selected, snapshot } = account;
  const expected = useExpectedControls(selected, useExpected(snapshot));
  const entries = buildEntries(snapshot, account.now);
  const entry = entries.find((candidate) => candidate.id === selected);
  const view = describeStatus({
    state: snapshot?.accounts.byMarketplace[selected],
    throttle: snapshot?.throttle.byMarketplace[selected],
    marketplace: MARKETPLACES[selected],
    checking: account.checking || snapshot === null,
    startFailed: account.startFailed,
    now: account.now,
    formatClock,
  });
  const match = entry?.match ?? "unknown";
  const { clearNotice } = expected;
  const { select } = account;
  const choose = useCallback(
    (id: MarketplaceId): void => {
      clearNotice();
      select(id);
    },
    [clearNotice, select],
  );
  return (
    <main class="app">
      <h1 class="sr-only">Amazon Account Detector</h1>
      <div class="hero">
        <MarketplaceMenu entries={entries} selected={selected} onSelect={choose} />
        <AccountCard
          marketplace={MARKETPLACES[selected]}
          view={view}
          match={match}
          expected={entry?.expected}
          notice={expected.notice}
          pinFocus={expected.pinFocus}
          canPin={hasEmailHash(snapshot, selected)}
          onSetExpected={expected.setCurrent}
          onClearExpected={expected.clearCurrent}
          onPinFocused={expected.onPinFocused}
        />
        <Actions account={account} match={match} onExpectCurrent={expected.expectCurrent} />
      </div>
      <Summary entries={entries} />
      {FOOTER}
    </main>
  );
}
