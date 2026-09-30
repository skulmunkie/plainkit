<#
    Example runner for the `plainkit audit` conformance CLI (core/tools/audit/cli.mjs), for a consumer app that
    wants to run it before it ships in the published npm/NuGet packages (issue #518/#629). Until then the CLI
    only exists in a plainkit source checkout, so this script finds one next to your project - a sibling clone,
    typically checked out by CI right before the audit step - and runs it against your target path.

    Once the CLI ships in the published package (`npx plainkit audit`, see
    core/site/guides/content/conformance-audit.md), delete this script and use that instead; nothing here will
    be needed any more.

    Usage:
      $env:PLAINKIT_AUDIT_ROOT = '..\plainkit'
      .\run-audit.ps1 src -Strict -Format json -Baseline plainkit.audit.baseline.json -MaxWarnings 0

    $env:PLAINKIT_AUDIT_ROOT must point at the root of a plainkit source checkout (the folder containing
    `core\`). Flags here are PowerShell-friendly names; they are translated to the CLI's own kebab-case flags
    (--strict, --format, --baseline, --update-baseline, --max-warnings) below - see
    `node core/tools/audit/cli.mjs --list-rules` and core/site/guides/content/conformance-audit.md for the full
    flag list, including ones not forwarded here (--strict-baseline, --rule, --skip, --config, ...).
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string[]]$Path,

    [switch]$Strict,

    [ValidateSet('text', 'json', 'sarif')]
    [string]$Format,

    [string]$Baseline,

    [switch]$UpdateBaseline,

    [int]$MaxWarnings = -1,

    # Anything else to forward verbatim (e.g. -Extra '--rule','D2').
    [string[]]$Extra
)

if (-not $env:PLAINKIT_AUDIT_ROOT) {
    Write-Error "run-audit.ps1: PLAINKIT_AUDIT_ROOT is not set - point it at a plainkit source checkout (e.g. ..\plainkit)."
    exit 2
}

$cli = Join-Path $env:PLAINKIT_AUDIT_ROOT 'core\tools\audit\cli.mjs'
if (-not (Test-Path $cli)) {
    Write-Error "run-audit.ps1: no CLI found at $cli - check PLAINKIT_AUDIT_ROOT points at a plainkit checkout."
    exit 2
}

$cliArgs = @($Path)
if ($Strict) { $cliArgs += '--strict' }
if ($Format) { $cliArgs += '--format', $Format }
if ($Baseline) { $cliArgs += '--baseline', $Baseline }
if ($UpdateBaseline) { $cliArgs += '--update-baseline' }
if ($MaxWarnings -ge 0) { $cliArgs += '--max-warnings', $MaxWarnings }
if ($Extra) { $cliArgs += $Extra }

& node $cli @cliArgs
exit $LASTEXITCODE
