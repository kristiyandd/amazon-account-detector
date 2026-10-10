import * as v from "valibot";
import { logDebug } from "@/core/log";
import { CheckMessageSchema } from "@/core/state";
import type { CheckMessage, Reply } from "@/core/state";

export interface Sender {
  readonly id?: string | undefined;
  readonly url?: string | undefined;
}

export interface RouterDeps {
  readonly extensionId: string;
  readonly popupUrl: string;
  readonly onCheck: (message: CheckMessage) => void;
}

function isOwnPopup(sender: Sender, deps: RouterDeps): boolean {
  return sender.id === deps.extensionId && sender.url?.split(/[#?]/u)[0] === deps.popupUrl;
}

export function handleMessage(message: unknown, sender: Sender, deps: RouterDeps): Reply {
  if (!isOwnPopup(sender, deps)) {
    logDebug("message rejected (sender)");
    return { accepted: false };
  }
  if (!v.is(CheckMessageSchema, message)) {
    logDebug("message rejected (schema)");
    return { accepted: false };
  }
  logDebug(`message accepted: check ${message.marketplace} manual=${String(message.manual)}`);
  deps.onCheck(message);
  return { accepted: true };
}
