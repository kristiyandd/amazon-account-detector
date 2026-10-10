import { describe, expect, it, vi } from "vitest";
import type { CheckMessage } from "@/core/state";
import { captureDebug } from "@/test/debug-capture";
import { handleMessage } from "./router";
import type { RouterDeps } from "./router";
import type { Mock } from "vitest";

const ID = "abcdefghijklmnopabcdefghijklmnop";
const POPUP = `chrome-extension://${ID}/src/popup/index.html`;
const check = { type: "check", marketplace: "de", manual: false };

function deps(): RouterDeps & { readonly onCheck: Mock<(message: CheckMessage) => void> } {
  return { extensionId: ID, popupUrl: POPUP, onCheck: vi.fn<(message: CheckMessage) => void>() };
}

describe("handleMessage", () => {
  it("accepts a check from the extension's own popup", () => {
    const routerDeps = deps();
    expect(handleMessage(check, { id: ID, url: POPUP }, routerDeps)).toEqual({ accepted: true });
    expect(routerDeps.onCheck).toHaveBeenCalledWith(check);
  });

  it("rejects messages from other extensions and from content on Amazon pages", () => {
    const routerDeps = deps();
    expect(handleMessage(check, { id: "other", url: POPUP }, routerDeps)).toEqual({
      accepted: false,
    });
    expect(handleMessage(check, { id: ID, url: "https://www.amazon.com/" }, routerDeps)).toEqual({
      accepted: false,
    });
    expect(handleMessage(check, { id: ID }, routerDeps)).toEqual({ accepted: false });
    expect(routerDeps.onCheck).not.toHaveBeenCalled();
  });

  it("rejects malformed messages and marketplaces given as URLs", () => {
    const routerDeps = deps();
    expect(
      handleMessage(
        { type: "check", marketplace: "https://evil.example.com", manual: false },
        { id: ID, url: POPUP },
        routerDeps,
      ),
    ).toEqual({ accepted: false });
    expect(handleMessage("check", { id: ID, url: POPUP }, routerDeps)).toEqual({ accepted: false });
  });
});

describe("handleMessage debug lines", () => {
  it("says whether the sender or the schema caused a rejection, and logs acceptance", () => {
    const capture = captureDebug();
    try {
      handleMessage(check, { id: "other", url: POPUP }, deps());
      handleMessage("check", { id: ID, url: POPUP }, deps());
      handleMessage(check, { id: ID, url: POPUP }, deps());
      expect(capture.lines()).toEqual([
        "[account-detector] message rejected (sender)",
        "[account-detector] message rejected (schema)",
        "[account-detector] message accepted: check de manual=false",
      ]);
    } finally {
      capture.stop();
    }
  });
});
