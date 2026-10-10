import { readFileSync } from "node:fs";
import js from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import stylistic from "@stylistic/eslint-plugin";
import vitestPlugin from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";
import { importX } from "eslint-plugin-import-x";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y-x";
import noUnsanitizedPlugin from "eslint-plugin-no-unsanitized";
import playwrightPlugin from "eslint-plugin-playwright";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import * as regexpPlugin from "eslint-plugin-regexp";
import unicornPlugin from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";
import { localPlugin } from "./eslint-rules/no-comments.ts";

const GIT_IGNORED = readFileSync(new URL(".gitignore", import.meta.url), "utf8")
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("!"))
  .map((line) => (line.slice(0, -1).includes("/") ? line.replace(/^\//u, "") : `**/${line}`));

const TEST_FILES = ["**/*.test.{ts,tsx,mjs}", "**/*.test-d.ts", "src/test/**/*.{ts,tsx}"];

const restrictedGlobal = (name: string, where: string): { name: string; message: string } => ({
  name,
  message: `${name} is not available or not allowed in ${where}.`,
});

const importsFrom = (
  layers: readonly string[],
  from: string,
): { patterns: { group: string[]; message: string }[] } => ({
  patterns: layers.map((layer) => ({
    group: [`@/${layer}/*`, `**/${layer}/*`],
    message: `${from} must not import from ${layer}/.`,
  })),
});

const RESTRICTED_SYNTAX = [
  {
    selector: "CatchClause[param=null]",
    message: "Empty catch — use catch (_err) instead of catch {}.",
  },
  {
    selector:
      "JSXAttribute > JSXExpressionContainer > :matches(ArrowFunctionExpression, FunctionExpression)",
    message: "No inline functions in JSX — extract to useCallback or a named function.",
  },
  {
    selector: "JSXAttribute > JSXExpressionContainer > CallExpression[callee.property.name='bind']",
    message: "No .bind() in JSX — extract to useCallback or a named function.",
  },
  {
    selector: "JSXAttribute[name.name='style']",
    message: "No inline styles — use a CSS class.",
  },
  {
    selector: "JSXAttribute > JSXExpressionContainer > Literal[value=true]",
    message: "Use boolean shorthand: <Comp disabled> instead of disabled={true}.",
  },
  {
    selector: "ImportExpression",
    message: "No dynamic import() — MV3 service workers do not support it; keep imports static.",
  },
  {
    selector: "ExportAllDeclaration",
    message: "No barrel re-exports — import from the module that defines it.",
  },
  {
    selector: "CallExpression[callee.property.name='then']",
    message: "Use async/await instead of .then() chains.",
  },
];

const NO_DEFAULT_EXPORT = {
  selector: "ExportDefaultDeclaration",
  message: "Named exports only.",
};

const COOKIE_VALUE_MESSAGE =
  "Never read a cookie's value — session cookies stay inside the browser (ADR-0006).";

const COOKIE_VALUE_SELECTORS = [
  "MemberExpression[property.name='value']",
  "MemberExpression[computed=true][property.value='value']",
  "ObjectPattern > Property[key.value='value']",
  "ObjectPattern > Property[computed=true]",
];

const COOKIE_VALUE_BAN = [
  ...COOKIE_VALUE_SELECTORS,
  "ObjectPattern > Property[key.name='value']",
].map((selector) => ({ selector, message: COOKIE_VALUE_MESSAGE }));

const STREAM_CHUNK_VALUE_BAN = [
  ...COOKIE_VALUE_SELECTORS,
  ":not(VariableDeclarator) > ObjectPattern > Property[key.name='value']",
  "VariableDeclarator:not([init.argument.callee.property.name='read']) > ObjectPattern > Property[key.name='value']",
].map((selector) => ({ selector, message: COOKIE_VALUE_MESSAGE }));

export default defineConfig(
  {
    ignores: [
      "dist/",
      "coverage/",
      "node_modules/",
      "playwright-report/",
      "test-results/",
      "reports/",
      ...GIT_IGNORED,
    ],
  },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  reactHooksPlugin.configs.flat.recommended,
  jsxA11yPlugin.configs.recommended,
  regexpPlugin.configs["flat/recommended"],
  noUnsanitizedPlugin.configs.recommended,

  {
    plugins: {
      local: localPlugin,
      unicorn: unicornPlugin,
      "import-x": importX,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "local/no-comments": "error",

      "no-console": "error",
      "no-debugger": "error",
      "no-alert": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX, NO_DEFAULT_EXPORT],

      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 8],
      "max-depth": ["error", 3],
      "max-params": ["error", 3],

      "regexp/no-super-linear-backtracking": ["error", { report: "potential" }],

      "unicorn/filename-case": ["error", { cases: { kebabCase: true, pascalCase: true } }],
      "unicorn/prefer-string-slice": "error",
      "unicorn/no-for-each": "error",
      "unicorn/prefer-node-protocol": "error",
      "unicorn/no-useless-undefined": "error",
      "unicorn/prefer-at": "error",
      "unicorn/no-nested-ternary": "error",
      "unicorn/no-lonely-if": "error",
      "unicorn/no-negated-condition": "error",
      "unicorn/throw-new-error": "error",
      "unicorn/prefer-type-error": "error",
      "unicorn/error-message": "error",
      "unicorn/prefer-structured-clone": "error",
      "unicorn/no-array-sort": "error",
      "unicorn/no-array-reverse": "error",
      "unicorn/prefer-array-flat-map": "error",

      "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          pathGroups: [{ pattern: "@/**", group: "internal", position: "before" }],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },

  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [eslintReact.configs["strict-type-checked"]],
    plugins: { "@stylistic": stylistic },
    settings: {
      "react-x": { importSource: "preact", version: "18.0.0" },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      "@stylistic/jsx-self-closing-comp": "error",
      "@stylistic/jsx-curly-brace-presence": [
        "error",
        { props: "never", children: "never", propElementValues: "always" },
      ],
      "@eslint-react/no-array-index-key": "error",
      "@eslint-react/no-missing-key": "error",
      "@eslint-react/no-nested-component-definitions": "error",
      "@eslint-react/no-unstable-context-value": "error",
      "@eslint-react/no-unstable-default-props": "error",
      "@eslint-react/jsx-no-useless-fragment": "error",
      "@eslint-react/dom-no-unsafe-target-blank": "error",
      "@eslint-react/web-api-no-leaked-event-listener": "error",
      "@eslint-react/web-api-no-leaked-timeout": "error",
      "@eslint-react/web-api-no-leaked-interval": "error",
      "@eslint-react/web-api-no-leaked-fetch": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: false },
      ],
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/require-array-sort-compare": "error",
      "@typescript-eslint/return-await": ["error", "error-handling-correctness-only"],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "no-empty-function": "off",
      "@typescript-eslint/no-empty-function": "error",
    },
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker, ...globals.webextensions },
    },
  },

  {
    files: ["src/core/**/*.ts"],
    ignores: TEST_FILES,
    rules: {
      "no-restricted-globals": [
        "error",
        ...["chrome", "fetch", "window", "document", "localStorage", "navigator"].map((name) =>
          restrictedGlobal(name, "core/ — it stays pure; take it as a parameter"),
        ),
      ],
      "no-restricted-imports": ["error", importsFrom(["background", "popup"], "core/")],
    },
  },

  {
    files: ["src/background/**/*.ts"],
    ignores: TEST_FILES,
    rules: {
      "no-restricted-globals": [
        "error",
        ...["window", "document", "localStorage"].map((name) =>
          restrictedGlobal(name, "the service worker"),
        ),
      ],
      "no-restricted-imports": ["error", importsFrom(["popup"], "background/")],
    },
  },

  {
    files: ["src/popup/**/*.{ts,tsx}"],
    ignores: TEST_FILES,
    rules: {
      "no-restricted-globals": [
        "error",
        ...["fetch", "localStorage"].map((name) =>
          restrictedGlobal(name, "the popup — it only talks to the service worker"),
        ),
      ],
      "no-restricted-imports": ["error", importsFrom(["background"], "popup/")],
    },
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RESTRICTED_SYNTAX,
        NO_DEFAULT_EXPORT,
        ...COOKIE_VALUE_BAN,
      ],
    },
  },

  {
    files: ["src/background/fetch-page.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RESTRICTED_SYNTAX,
        NO_DEFAULT_EXPORT,
        ...STREAM_CHUNK_VALUE_BAN,
      ],
    },
  },

  {
    files: ["src/core/log.ts", "scripts/**/*.ts"],
    rules: { "no-console": ["error", { allow: ["warn", "error", "debug"] }] },
  },

  {
    files: TEST_FILES,
    extends: [vitestPlugin.configs.recommended],
    rules: {
      "max-lines-per-function": "off",
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/consistent-test-it": ["error", { fn: "it" }],
      "vitest/expect-expect": [
        "error",
        { assertFunctionNames: ["expect", "expectTypeOf", "assertType"] },
      ],
    },
  },

  {
    files: ["**/*.test-d.ts"],
    rules: { "local/no-comments": ["error", { allowTsExpectError: true }] },
  },

  {
    files: ["e2e/**/*.ts"],
    extends: [playwrightPlugin.configs["flat/recommended"]],
    rules: {
      "max-lines-per-function": "off",
      "playwright/no-focused-test": "error",
      "playwright/no-skipped-test": "error",
      "playwright/no-wait-for-timeout": "error",
    },
  },

  {
    files: [
      "*.config.{ts,mts,mjs}",
      "*.test.ts",
      "e2e/**/*.ts",
      "scripts/**/*",
      "eslint-rules/**/*",
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX] },
  },

  {
    files: ["**/*.d.ts"],
    rules: { "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX] },
  },

  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },
);
