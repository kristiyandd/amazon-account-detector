import type { ESLint, Rule } from "eslint";

const TS_DIRECTIVE = /^\s*@ts-expect-error\b/u;

interface NoCommentsOptions {
  readonly allowTsExpectError?: boolean;
}

function isOptions(value: unknown): value is NoCommentsOptions {
  return typeof value === "object" && value !== null;
}

export const noComments: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow comments; names, small functions and tests carry the meaning" },
    messages: {
      noComment: "Comments are not allowed — rename, extract a function or write a test instead.",
    },
    schema: [
      {
        type: "object",
        properties: { allowTsExpectError: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options: unknown = context.options[0];
    const allowTsExpectError = isOptions(options) && options.allowTsExpectError === true;
    return {
      Program(): void {
        for (const comment of context.sourceCode.getAllComments()) {
          const isAllowedDirective =
            allowTsExpectError && comment.type === "Line" && TS_DIRECTIVE.test(comment.value);
          if (!isAllowedDirective && comment.loc) {
            context.report({ loc: comment.loc, messageId: "noComment" });
          }
        }
      },
    };
  },
};

export const localPlugin: ESLint.Plugin = {
  meta: { name: "local" },
  rules: { "no-comments": noComments },
};
