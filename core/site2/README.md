# Site V2 (provisional path)

This directory is the build target for the Site V2 / strict-module-mode rebuild described in
`docs/superpowers/specs/2026-09-28-site-v2-strict-modules-design.md` (design PR #515, `Refs #346`).

**It is empty on purpose.** The owner has approved the path and the "keep V1 until deletion, rename
later at cutover" decision (spec Q2), but the remaining open questions (Q1, Q3-Q11, listed in the
spec's section 6 and in the tracker issue #346) are still undecided. No module anatomy, no
`defineModule`/`pk()`/`defineComponent` builder and no strict-mode enforcement (rules S1-S12) may be
written here until those questions are answered and a step issue authorizes the work (see the
tracker's step-issue breakdown, section 4 of the spec).

Until then, `core/site` (V1) remains the live Gallery App and is not touched by this preparation.

When work starts, follow:

- `AGENTS.md` and `CONTRIBUTING.md` for the branch/issue/pull-request flow.
- `core/STANDARDS.md`, "Ownership and reactivity", for the rules every module and element follows.
- The spec's section 2 ("Module anatomy") for the folder layout every `modules/<id>/` and
  `shared/components/<name>/` directory must have.
- The spec's section 4 ("Site V2 plan") for the module-by-module build order and dependencies
  (component gaps filed under #336, `pk-canvas` #430, `pk-dock` #432, etc.).

See also: `docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md` (design PR #531) for
the consumer-facing audit CLI that will eventually reuse the same strict-mode rule engine.
