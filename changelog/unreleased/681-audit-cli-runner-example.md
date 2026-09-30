---
type: notes
issue: 681
---
`examples/audit-cli/` adds a minimal bash and PowerShell runner showing how to invoke the conformance-audit CLI (`core/tools/audit/cli.mjs`) from a sibling plainkit checkout before it ships in the published packages, including the baseline flags for gating CI on new findings only; the conformance-audit guide links to it.
