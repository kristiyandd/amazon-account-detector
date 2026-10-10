# ADR-0004: Strict TypeScript everywhere, verified pins, right-sized gates

- Status: Accepted
- Date: 2026-10-10

## Context

Quality has to be visible to a reviewer and enforced mechanically, without turning a take-home
into a tooling project. An earlier plan had 16 gates (mutation testing, type-coverage,
duplication, bundle budgets, p95 performance); a review estimated it at 20–40 hours of tooling
on top of the product.

## Decision

### TypeScript

- `typescript` **6.0.3**, not 7: typescript-eslint's peer range is `<6.1`, and type-aware lint
  matters more than the compiler's speed on a repo this size
- Two programs: `tsconfig.app.json` (browser, `chrome-types`) and `tsconfig.node.json` (configs,
  scripts, tests, `@types/node` 24). Checked with `tsc -b`, because with a solution
  `tsconfig.json`, `tsc --noEmit` checks nothing and always passes
- Strict flags beyond `strict`: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noImplicitOverride`,
  `erasableSyntaxOnly`, `verbatimModuleSyntax`
- No JavaScript: scripts, the ESLint rule and the ESLint config are `.ts`, run
  by Node 24's built-in type stripping

### Lint

- ESLint **10**, because 9 is marked deprecated on npm. `eslint-plugin-react` and `jsx-a11y` do not
  support 10, so `@eslint-react/eslint-plugin` and `eslint-plugin-jsx-a11y-x` replace them
- typescript-eslint `strictTypeChecked`; no `any`, no type assertions, no floating promises,
  exhaustive switches; `no-unsanitized` and ReDoS-safe regexes; layer boundaries (ADR-0002)
- A local `no-comments` rule: the only allowed comment is `// @ts-expect-error <reason>` in
  type tests
- `eslint_d` for linting one file after each edit: identical findings in about 0.4 s instead of
  about 7 s

### Dependencies

- Exact versions, each installed and run before it was pinned
- `.npmrc`: `min-release-age=7` (a version must be a week old; it rejected several pins, and
  older versions were chosen instead of weakening it), `allow-git=none`, `engine-strict`
- Install scripts only when approved (`allowScripts` in `package.json`); `unrs-resolver`'s
  postinstall is denied because its native binding works without it
- Runtime dependencies: `preact`, plus `valibot` for the schemas at trust boundaries (added
  with the detection work)

### Gates (`npm run check`, about 30 s warm, about 1.5 min on a fresh clone)

Format, `tsc -b`, ESLint (0 warnings), knip, Vitest with coverage (90 % lines / 80 % branches on
`core` + `background`; 80 % lines / 70 % branches on `popup`, the entry points `main.tsx` and
`background/index.ts` excluded), build, Playwright E2E + axe (light and dark), no real emails, `npm
audit` (dev dependencies included) + `npm audit signatures`.

Deferred to the README's "With more time": Stryker, type-coverage, dependency-cruiser, jscpd,
size-limit, p95 performance gates, CodeQL / gitleaks, oxlint with TS 7. Git-dependent tooling
(husky, CI, Dependabot) waits until the repository is created.

## Consequences

- Good: every gate was shown to fail on a deliberate violation, so a green run means something
- Good: Node globals cannot leak into browser code, and nothing in the repo escapes the type
  checker
- Bad: pinning one week behind means missing very recent fixes; a known advisory can still be
  patched by an explicit, reviewed bump
- Bad: two `@eslint-react` / `jsx-a11y-x` replacements are younger projects than the plugins
  they replace

## Verification

Probes: a type error under `tsc --noEmit` passes but fails `tsc -b`; `process` in `src/` is a
type error; an untested `core` file fails coverage; an orphan file fails knip.
