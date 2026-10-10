import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { manualCooldownLeft } from "@/core/backoff";
import { needsCheck } from "@/core/freshness";
import { logDebug } from "@/core/log";
import type { MarketplaceId } from "@/core/marketplaces";
import { DEFAULT_PREFS } from "@/core/state";
import type { AccountState } from "@/core/state";
import { activeTabMarketplace, readSnapshot, requestCheck, savePrefs, subscribe } from "../api";
import type { Snapshot } from "../api";

const PENDING_TIMEOUT_MS = 30_000;
const TICK_MS = 1000;

interface Pending {
  readonly id: MarketplaceId;
  readonly since: number;
}

interface Clock {
  readonly now: number;
  readonly refresh: () => void;
}

export interface AccountView {
  readonly snapshot: Snapshot | null;
  readonly selected: MarketplaceId;
  readonly checking: boolean;
  readonly startFailed: boolean;
  readonly cooldownSeconds: number;
  readonly now: number;
  readonly select: (id: MarketplaceId) => void;
  readonly checkNow: () => void;
}

function useNow(intervalMs: number): Clock {
  const [clock, setClock] = useState(() => ({ now: Date.now(), epoch: 0 }));
  useEffect(() => {
    const timer = setInterval(() => {
      setClock((previous) => ({ now: Date.now(), epoch: previous.epoch }));
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs, clock.epoch]);
  const refresh = useCallback((): void => {
    setClock((previous) => ({ now: Date.now(), epoch: previous.epoch + 1 }));
  }, []);
  return { now: clock.now, refresh };
}

function cooldownMsOf(snapshot: Snapshot | null, clicked: Pending | null, view: Pending): number {
  const stored = manualCooldownLeft(
    snapshot?.throttle.byMarketplace[view.id]?.lastManualAt,
    view.since,
  );
  const local = clicked?.id === view.id ? manualCooldownLeft(clicked.since, view.since) : 0;
  return Math.max(stored, local);
}

interface RequestTicket {
  readonly begin: () => number;
  readonly isLatest: (ticket: number) => boolean;
  readonly isActive: () => boolean;
}

function useRequestTicket(): RequestTicket {
  const latestRef = useRef(0);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const isActive = useCallback((): boolean => activeRef.current, []);
  const begin = useCallback((): number => {
    latestRef.current += 1;
    return latestRef.current;
  }, []);
  const isLatest = useCallback((ticket: number): boolean => ticket === latestRef.current, []);
  return { begin, isLatest, isActive };
}

function isAwaiting(pending: Pending, state: AccountState | undefined, now: number): boolean {
  const lastWrite = Math.max(state?.checkedAt ?? 0, state?.lastError?.at ?? 0);
  return lastWrite < pending.since && now - pending.since < PENDING_TIMEOUT_MS;
}

function wantsCheck(snapshot: Snapshot, id: MarketplaceId): boolean {
  const wanted = needsCheck(
    snapshot.accounts.byMarketplace[id],
    snapshot.throttle.byMarketplace[id],
    Date.now(),
  );
  logDebug(wanted ? `popup: ${id} → check requested` : `popup: ${id} fresh → no check`);
  return wanted;
}

interface SnapshotSync {
  readonly setSnapshot: (next: Snapshot) => void;
  readonly start: (id: MarketplaceId, manual: boolean) => Promise<void>;
  readonly chosenRef: { readonly current: MarketplaceId | null };
  readonly adopt: (id: MarketplaceId) => void;
}

function adoptTab(sync: SnapshotSync, snapshot: Snapshot, tab: MarketplaceId | undefined): void {
  if (tab !== undefined && sync.chosenRef.current === null && tab !== snapshot.prefs.selected) {
    sync.adopt(tab);
  }
}

function useSnapshotSync(sync: SnapshotSync): void {
  const { setSnapshot, start, chosenRef } = sync;
  useEffect(() => {
    let active = true;
    const load = async (first: boolean): Promise<void> => {
      const [next, tab] = await Promise.all([
        readSnapshot(),
        first ? activeTabMarketplace() : undefined,
      ]);
      if (!active) {
        return;
      }
      adoptTab(sync, next, tab);
      setSnapshot(next);
      const target = chosenRef.current ?? next.prefs.selected;
      if (first) {
        logDebug(`popup: open, selected=${target}`);
      }
      if (first && wantsCheck(next, target)) {
        await start(target, false);
      }
    };
    void load(true);
    const unsubscribe = subscribe(() => {
      void load(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [sync, setSnapshot, start, chosenRef]);
}

interface Chosen {
  readonly chosen: MarketplaceId | null;
  readonly chosenRef: { readonly current: MarketplaceId | null };
  readonly adopt: (id: MarketplaceId) => void;
}

function useChosen(): Chosen {
  const [chosen, setChosen] = useState<MarketplaceId | null>(null);
  const chosenRef = useRef<MarketplaceId | null>(null);
  const adopt = useCallback((id: MarketplaceId): void => {
    chosenRef.current = id;
    setChosen(id);
    void savePrefs(id);
  }, []);
  return { chosen, chosenRef, adopt };
}

export function useAccountState(): AccountView {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const { chosen, chosenRef, adopt } = useChosen();
  const [pending, setPending] = useState<Pending | null>(null);
  const [failedFor, setFailedFor] = useState<MarketplaceId | null>(null);
  const [clicked, setClicked] = useState<Pending | null>(null);
  const { now, refresh } = useNow(TICK_MS);
  const { begin, isLatest, isActive } = useRequestTicket();
  const selected = chosen ?? snapshot?.prefs.selected ?? DEFAULT_PREFS.selected;
  const startFailed = failedFor === selected;
  const cooldownMs = cooldownMsOf(snapshot, clicked, { id: selected, since: now });

  const start = useCallback(
    async (id: MarketplaceId, manual: boolean): Promise<void> => {
      const ticket = begin();
      setFailedFor(null);
      setPending({ id, since: Date.now() });
      const accepted = await requestCheck(id, manual);
      if (!isActive()) {
        logDebug(`popup: closed, answer for ${id} ignored`);
        return;
      }
      if (!isLatest(ticket)) {
        logDebug(`popup: late answer for ${id} ignored`);
        return;
      }
      if (!accepted) {
        logDebug(`popup: start failed for ${id}`);
        setFailedFor(id);
        setPending(null);
      }
    },
    [begin, isLatest, isActive],
  );

  const sync = useMemo(() => ({ setSnapshot, start, chosenRef, adopt }), [start, adopt, chosenRef]);
  useSnapshotSync(sync);

  const select = useCallback(
    (id: MarketplaceId): void => {
      adopt(id);
      if (snapshot !== null && wantsCheck(snapshot, id)) {
        void start(id, false);
      }
    },
    [snapshot, start, adopt],
  );

  const checkNow = useCallback((): void => {
    setClicked({ id: selected, since: Date.now() });
    refresh();
    void start(selected, true);
  }, [selected, start, refresh]);

  const checking =
    pending?.id === selected &&
    isAwaiting(pending, snapshot?.accounts.byMarketplace[selected], now);
  const cooldownSeconds = Math.ceil(cooldownMs / 1000);
  return { snapshot, selected, checking, startFailed, cooldownSeconds, now, select, checkNow };
}
