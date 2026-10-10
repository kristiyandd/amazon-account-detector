const EMAIL = /[^\s"'<>@]{1,64}@[^\s"'<>@]{1,253}/gu;
const PREFIX = "[account-detector]";

export function maskEmails(text: string): string {
  return text.replace(
    EMAIL,
    (match: string) => `${match.slice(0, 1)}***@${match.split("@").at(-1) ?? ""}`,
  );
}

let debugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

export function isDebugLogging(): boolean {
  return debugEnabled;
}

export function logDebug(message: string): void {
  if (debugEnabled) {
    console.debug(`${PREFIX} ${maskEmails(message)}`);
  }
}

export function logWarn(message: string): void {
  console.warn(`${PREFIX} ${maskEmails(message)}`);
}

export function logError(message: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : "non-Error value";
  console.error(`${PREFIX} ${maskEmails(message)}: ${maskEmails(detail)}`);
}
