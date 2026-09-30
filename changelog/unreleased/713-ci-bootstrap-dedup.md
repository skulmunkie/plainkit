---
type: notes
issue: 713
---
CI/tooling only, no visible effect: the release workflow's `publish` job now reuses the `build` job's already-bootstrapped `core/dist` (from the release assets it uploaded) instead of running `npm ci` and a full `node scripts/bootstrap.mjs` a second time just to publish to npm.
