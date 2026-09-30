# Sibling-checkout runner examples for `plainkit audit`

Until the conformance-audit CLI ([#518](https://github.com/skulmunkie/plainkit/issues/518),
[#629](https://github.com/skulmunkie/plainkit/issues/629)) ships as part of the published npm/NuGet packages
(tracked in [#681](https://github.com/skulmunkie/plainkit/issues/681)), a consumer app can only run it by
pointing at a local plainkit source checkout: `node <checkout>/core/tools/audit/cli.mjs <target>`. That is not
discoverable without reading the CLI's own source, so `run-audit.sh` and `run-audit.ps1` here show the pattern:
resolve a plainkit checkout from an environment variable, then invoke the CLI against it.

**Once the CLI ships in the published package**, drop these scripts and call `npx plainkit audit` directly (see
the doc, `core/site/guides/content/conformance-audit.md`) - nothing here is needed any more.

## The pattern

1. Check out plainkit as a sibling of your project (in CI, an extra `actions/checkout` step or similar; locally,
   a normal `git clone` next to your repo).
2. Set `PLAINKIT_AUDIT_ROOT` to that checkout's root (the folder containing `core/`).
3. Run the example script with your target path and whatever flags you need.

```bash
# bash
PLAINKIT_AUDIT_ROOT=../plainkit ./run-audit.sh src --strict --format json
```

```powershell
# PowerShell
$env:PLAINKIT_AUDIT_ROOT = '..\plainkit'
.\run-audit.ps1 src -Strict -Format json
```

## Gating CI on new findings only (the baseline/fingerprint mechanism)

`core/tools/audit/baseline.mjs` fingerprints each finding by rule id, normalised message and file path (not the
line number, so moving code does not resurface an already-known finding). That lets an existing app adopt the
audit without fixing every finding on day one: record today's findings once, then fail only when a *new* one
appears.

```bash
# once, locally: record the current findings as the baseline
PLAINKIT_AUDIT_ROOT=../plainkit ./run-audit.sh src --update-baseline --baseline plainkit.audit.baseline.json
git add plainkit.audit.baseline.json

# in CI: fail only on findings not already in the baseline
PLAINKIT_AUDIT_ROOT=../plainkit ./run-audit.sh src --baseline plainkit.audit.baseline.json --max-warnings 0
```

```powershell
# once, locally
$env:PLAINKIT_AUDIT_ROOT = '..\plainkit'
.\run-audit.ps1 src -UpdateBaseline -Baseline plainkit.audit.baseline.json
git add plainkit.audit.baseline.json

# in CI
.\run-audit.ps1 src -Baseline plainkit.audit.baseline.json -MaxWarnings 0
```

`--max-warnings 0` fails the run if any warning-severity finding is left uncovered by the baseline; combine with
`--strict` to also promote most warnings to errors. See `core/site/guides/content/conformance-audit.md` for the
full flag list and rule families, or run `node <checkout>/core/tools/audit/cli.mjs --list-rules` /
`--explain <rule-id>` directly against your checkout.
