import * as v from "valibot";
import { EmailSchema } from "./email";
import { MARKETPLACE_IDS } from "./marketplaces";
import type { Email } from "./email";

const REASONS = [
  "challenge",
  "rateLimited",
  "network",
  "timeout",
  "server",
  "parse",
  "sessionMismatch",
] as const;

export type Reason = (typeof REASONS)[number];

export type Outcome =
  | { readonly kind: "signedIn"; readonly email: Email | null }
  | { readonly kind: "signedOut" }
  | { readonly kind: "failed"; readonly reason: Reason };

export const ACCOUNTS_KEY = "accounts";
export const PREFS_KEY = "prefs";
export const THROTTLE_KEY = "throttle";
export const DEBUG_KEY = "debug";
export const EXPECTED_KEY = "expected";

export const MarketplaceIdSchema = v.picklist(MARKETPLACE_IDS);

const Count = v.pipe(v.number(), v.integer(), v.minValue(0));
const HashSchema = v.pipe(v.string(), v.regex(/^[\da-f]{64}$/u));

const AccountStateSchema = v.object({
  status: v.picklist(["signedIn", "signedOut", "unknown"]),
  email: v.optional(EmailSchema),
  emailHash: v.optional(HashSchema),
  checkedAt: v.optional(v.number()),
  lastError: v.optional(v.object({ reason: v.picklist(REASONS), at: v.number() })),
  generation: Count,
});

export type AccountState = v.InferOutput<typeof AccountStateSchema>;

export const AccountsSchema = v.object({
  schemaVersion: v.literal(1),
  byMarketplace: v.object({
    us: v.optional(AccountStateSchema),
    uk: v.optional(AccountStateSchema),
    de: v.optional(AccountStateSchema),
    it: v.optional(AccountStateSchema),
    fr: v.optional(AccountStateSchema),
  }),
});

export type Accounts = v.InferOutput<typeof AccountsSchema>;

const MAX_DATE_MS = 8.64e15;

const TimestampSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(MAX_DATE_MS));

const ThrottleEntrySchema = v.object({
  failures: Count,
  nextAllowedAt: TimestampSchema,
  lastManualAt: v.optional(TimestampSchema),
});

export type ThrottleEntry = v.InferOutput<typeof ThrottleEntrySchema>;

export const ThrottleSchema = v.object({
  schemaVersion: v.literal(1),
  byMarketplace: v.object({
    us: v.optional(ThrottleEntrySchema),
    uk: v.optional(ThrottleEntrySchema),
    de: v.optional(ThrottleEntrySchema),
    it: v.optional(ThrottleEntrySchema),
    fr: v.optional(ThrottleEntrySchema),
  }),
});

export type Throttle = v.InferOutput<typeof ThrottleSchema>;

const ExpectedEntrySchema = v.object({
  hash: HashSchema,
  hint: v.pipe(v.string(), v.maxLength(320)),
});

export type ExpectedEntry = v.InferOutput<typeof ExpectedEntrySchema>;

export const ExpectedSchema = v.object({
  schemaVersion: v.literal(1),
  byMarketplace: v.object({
    us: v.optional(ExpectedEntrySchema),
    uk: v.optional(ExpectedEntrySchema),
    de: v.optional(ExpectedEntrySchema),
    it: v.optional(ExpectedEntrySchema),
    fr: v.optional(ExpectedEntrySchema),
  }),
});

export type Expected = v.InferOutput<typeof ExpectedSchema>;

export const PrefsSchema = v.object({ schemaVersion: v.literal(1), selected: MarketplaceIdSchema });

export type Prefs = v.InferOutput<typeof PrefsSchema>;

export const CheckMessageSchema = v.object({
  type: v.literal("check"),
  marketplace: MarketplaceIdSchema,
  manual: v.boolean(),
});

export type CheckMessage = v.InferOutput<typeof CheckMessageSchema>;

export const ReplySchema = v.object({ accepted: v.boolean() });

export type Reply = v.InferOutput<typeof ReplySchema>;

export const EMPTY_ACCOUNTS: Accounts = { schemaVersion: 1, byMarketplace: {} };
export const EMPTY_THROTTLE: Throttle = { schemaVersion: 1, byMarketplace: {} };
export const EMPTY_EXPECTED: Expected = { schemaVersion: 1, byMarketplace: {} };
export const DEFAULT_PREFS: Prefs = { schemaVersion: 1, selected: "us" };

export function parseOr<TSchema extends v.GenericSchema>(
  schema: TSchema,
  value: unknown,
  fallback: v.InferOutput<TSchema>,
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, value);
  return result.success ? result.output : fallback;
}
