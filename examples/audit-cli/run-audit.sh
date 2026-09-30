#!/usr/bin/env bash
# Example runner for the `plainkit audit` conformance CLI (core/tools/audit/cli.mjs), for a consumer app that
# wants to run it before it ships in the published npm/NuGet packages (issue #518/#629). Until then the CLI only
# exists in a plainkit source checkout, so this script finds one next to your project - a sibling clone,
# typically checked out by CI right before the audit step - and runs it against your target path.
#
# Once the CLI ships in the published package (`npx plainkit audit`, see core/site/guides/content/conformance-audit.md),
# delete this script and use that instead; nothing here will be needed any more.
#
# Usage:
#   PLAINKIT_AUDIT_ROOT=../plainkit ./run-audit.sh src [--strict] [--format json] \
#       [--baseline plainkit.audit.baseline.json] [--update-baseline] [--max-warnings 0]
#
# PLAINKIT_AUDIT_ROOT must point at the root of a plainkit source checkout (the folder containing `core/`).
# Every other argument is forwarded to the CLI as-is - see `node core/tools/audit/cli.mjs --list-rules` and
# core/site/guides/content/conformance-audit.md for the full flag list (--strict, --format text|json|sarif,
# --baseline <file>, --update-baseline, --strict-baseline, --max-warnings <n>, --rule, --skip, --config, ...).
set -euo pipefail

if [[ -z "${PLAINKIT_AUDIT_ROOT:-}" ]]; then
    echo "run-audit.sh: PLAINKIT_AUDIT_ROOT is not set - point it at a plainkit source checkout (e.g. ../plainkit)." >&2
    exit 2
fi

CLI="$PLAINKIT_AUDIT_ROOT/core/tools/audit/cli.mjs"
if [[ ! -f "$CLI" ]]; then
    echo "run-audit.sh: no CLI found at $CLI - check PLAINKIT_AUDIT_ROOT points at a plainkit checkout." >&2
    exit 2
fi

exec node "$CLI" "$@"
