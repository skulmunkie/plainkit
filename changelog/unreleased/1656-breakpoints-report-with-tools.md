---
type: changed
issue: 1656
---
`breakpoints.report.json` ships with the `plainkit.tools` package instead of the npm core package (about 23 KB unpacked less); the Custom SDK export and the theme editor read it when the tools are installed and skip the breakpoints step without it.
