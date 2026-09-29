---
type: notes
issue: 514
---
The app framework entry graph's size budget (`appEntryGzKb`, `core/tests/app-budgets.test.mjs`) is a documented, one-time exception to the "budgets only ever come down" rule: after two rounds of splitting could not reach the original 6 KB target, the owner revised the limit up to match the entry graph's actual measured size (22 KB gzip) and made it a hard cap going forward — any future addition to the entry graph must be offset by an equal-or-greater reduction elsewhere in it. No runtime behavior changes.
