# Architecture decision records

Short records of decisions that shape this extension, in [MADR](https://adr.github.io/madr/)
style. Each one says what was decided, what else was considered, and how the decision was
verified.

| ADR                                             | Decision                                                            | Status                        |
| ----------------------------------------------- | ------------------------------------------------------------------- | ----------------------------- |
| [0001](0001-build-tooling.md)                   | Vite + CRXJS + Preact, with the manifest in code                    | Accepted                      |
| [0002](0002-architecture.md)                    | Three folders with one seam, enforced by lint                       | Accepted                      |
| [0003](0003-least-privilege-manifest.md)        | Least-privilege manifest and a strict CSP                           | Accepted, amended by 0006     |
| [0004](0004-toolchain-and-quality-gates.md)     | Strict TypeScript everywhere, verified pins, right-sized gates      | Accepted                      |
| [0005](0005-marketplace-signin-parameters.md)   | Per-marketplace `assoc_handle`; classify non-sign-in answers        | Accepted (signed-out capture) |
| [0006](0006-session-cookie-host-permissions.md) | Wildcard Amazon hosts to watch the session cookie; `alarms` dropped | Accepted                      |
| [0007](0007-detection-approach.md)              | On-demand sign-in fetch plus a session-cookie watcher               | Accepted                      |
| [0008](0008-email-storage.md)                   | Email in `storage.session` only                                     | Accepted                      |
| [0009](0009-expected-account-storage.md)        | Expected account as a SHA-256 hash and a masked hint                | Accepted                      |
