import type { AccountState, Outcome, Reason } from "./state";

function failedState(
  previous: AccountState | undefined,
  reason: Reason,
  now: number,
): AccountState {
  const lastError = { reason, at: now };
  return reason === "sessionMismatch" || previous === undefined
    ? { status: "unknown", generation: previous?.generation ?? 0, lastError }
    : { ...previous, lastError };
}

export function nextState(
  previous: AccountState | undefined,
  outcome: Outcome,
  now: number,
): AccountState {
  const generation = previous?.generation ?? 0;
  switch (outcome.kind) {
    case "signedIn":
      return outcome.email === null
        ? { status: "signedIn", checkedAt: now, generation }
        : { status: "signedIn", email: outcome.email, checkedAt: now, generation };
    case "signedOut":
      return { status: "signedOut", checkedAt: now, generation };
    case "failed":
      return failedState(previous, outcome.reason, now);
  }
}

export function withEmailHash(state: AccountState, emailHash: string | null): AccountState {
  return emailHash === null || state.email === undefined ? state : { ...state, emailHash };
}

export function invalidatedByCookie(previous: AccountState | undefined): AccountState {
  return { status: "unknown", generation: (previous?.generation ?? 0) + 1 };
}

export function signedOutByCookie(previous: AccountState | undefined, now: number): AccountState {
  return { status: "signedOut", checkedAt: now, generation: (previous?.generation ?? 0) + 1 };
}

function errorKey(error: AccountState["lastError"]): string {
  return error === undefined ? "-" : `${error.reason}@${String(error.at)}`;
}

function keyOf(state: AccountState): string {
  return [
    state.status,
    String(state.email),
    String(state.emailHash),
    String(state.checkedAt),
    String(state.generation),
    errorKey(state.lastError),
  ].join("|");
}

export function sameState(a: AccountState | undefined, b: AccountState): boolean {
  return a !== undefined && keyOf(a) === keyOf(b);
}
