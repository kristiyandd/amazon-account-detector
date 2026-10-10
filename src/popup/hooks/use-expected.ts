import { useCallback } from "preact/hooks";
import { maskEmail } from "@/core/expected";
import { logWarn } from "@/core/log";
import type { MarketplaceId } from "@/core/marketplaces";
import { saveExpected } from "../api";
import type { Snapshot } from "../api";

export interface ExpectedActions {
  readonly setExpected: (id: MarketplaceId) => void;
  readonly clearExpected: (id: MarketplaceId) => void;
}

async function storeExpected(id: MarketplaceId, hash: string, email: string): Promise<void> {
  try {
    await saveExpected(id, { hash, hint: maskEmail(email) });
  } catch (_err) {
    logWarn(`popup: saving the expected account for ${id} failed`);
  }
}

async function removeExpected(id: MarketplaceId): Promise<void> {
  try {
    await saveExpected(id, null);
  } catch (_err) {
    logWarn(`popup: clearing the expected account for ${id} failed`);
  }
}

export function useExpected(snapshot: Snapshot | null): ExpectedActions {
  const setExpected = useCallback(
    (id: MarketplaceId): void => {
      const state = snapshot?.accounts.byMarketplace[id];
      if (state?.email !== undefined && state.emailHash !== undefined) {
        void storeExpected(id, state.emailHash, state.email);
      }
    },
    [snapshot],
  );
  const clearExpected = useCallback((id: MarketplaceId): void => {
    void removeExpected(id);
  }, []);
  return { setExpected, clearExpected };
}
