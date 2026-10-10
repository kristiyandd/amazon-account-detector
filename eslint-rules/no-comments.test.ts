import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noComments } from "./no-comments.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const allowDirective = [{ allowTsExpectError: true }];

ruleTester.run("no-comments", noComments, {
  valid: [
    { code: "const answer: number = 42;" },
    { code: "const url = 'https://www.amazon.de/ap/signin';" },
    { code: String.raw`const pattern = /\/\/.*$/u;` },
    { code: "const text = '/* not a comment */';" },
    {
      code: "// @ts-expect-error\nconst a: number = 'x';",
      options: allowDirective,
    },
  ],
  invalid: [
    { code: "// explains the next line\nconst a = 1;", errors: [{ messageId: "noComment" }] },
    { code: "/* block */ const a = 1;", errors: [{ messageId: "noComment" }] },
    { code: "/** jsdoc */\nfunction f(): void {}", errors: [{ messageId: "noComment" }] },
    {
      code: "// @ts-expect-error\nconst a: number = 'x';",
      errors: [{ messageId: "noComment" }],
    },
    {
      code: "// @ts-ignore\nconst a: number = 'x';",
      options: allowDirective,
      errors: [{ messageId: "noComment" }],
    },
    {
      code: "/* @ts-expect-error */\nconst a: number = 'x';",
      options: allowDirective,
      errors: [{ messageId: "noComment" }],
    },
    {
      code: "// eslint-disable-next-line\nconst a = 1;",
      options: allowDirective,
      errors: [{ messageId: "noComment" }],
    },
    {
      code: "const a = 1; // trailing\n// second",
      errors: [{ messageId: "noComment" }, { messageId: "noComment" }],
    },
  ],
});
