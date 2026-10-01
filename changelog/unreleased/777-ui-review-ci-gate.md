---
type: notes
issue: 777
---
The pull request UI review starts no runner work when no element source or Blazor mapping changed, and a token, base CSS or layout change reviews only its changed elements unless the pull request has the label `ui-review-full`. A nightly `ui-review-sweep` workflow renders every element and scenario on `main` in four shards (`--skip-base` on `scripts/ui-review.mjs` turns off the base-file expansion).
