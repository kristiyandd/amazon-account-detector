import * as v from "valibot";

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};
const MAX_CODE_POINT = 0x10_ff_ff;

export const EmailSchema = v.pipe(
  v.string(),
  v.maxLength(254),
  v.regex(/^[^\s"'*<>@]{1,64}@[^\s"'*.<>@]+(?:\.[^\s"'*.<>@]+)+$/u),
  v.brand("Email"),
);

export type Email = v.InferOutput<typeof EmailSchema>;

function fromCodePoint(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= MAX_CODE_POINT
    ? String.fromCodePoint(code)
    : "";
}

export function decodeEntities(raw: string): string {
  return raw
    .replace(/&#x([\da-f]{1,6});/giu, (_match: string, hex: string) =>
      fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d{1,7});/gu, (_match: string, decimal: string) =>
      fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(
      /&(amp|quot|apos|lt|gt);/gu,
      (_match: string, name: string) => NAMED_ENTITIES[name] ?? "",
    );
}

export function parseEmail(raw: string): Email | null {
  const result = v.safeParse(EmailSchema, decodeEntities(raw).trim());
  return result.success ? result.output : null;
}
