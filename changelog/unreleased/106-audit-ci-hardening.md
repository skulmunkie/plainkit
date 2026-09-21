---
type: notes
issue: 106
---
Supply-chain hardening from the security audit: the CI summary job runs the reporting script from the base branch (it holds a token that can write to pull requests), the release job publishes the GitHub release with the `gh` CLI instead of a third-party action, the NuGet login action is pinned to a commit and the NuGet key reaches the push step through the environment; Dependabot watches the GitHub Actions and the NuGet packages, `SECURITY.md` says how to report a vulnerability, and an optional weekly CodeQL workflow scans the JavaScript and the C#. The repository settings the owner should apply are in `.github/REPO-SETTINGS.md`.
