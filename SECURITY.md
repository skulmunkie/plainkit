# Security policy

## Reporting a vulnerability

Please report a suspected vulnerability privately, not in a public issue or pull request.

- Use GitHub's private vulnerability reporting: the **Security** tab of this repository, then **Report a vulnerability**
  (`https://github.com/skulmunkie/plainkit/security/advisories/new`).
- Include the version (`core/VERSION`, or the package version), what you did, what you expected and what happened, and a minimal page or test that shows it.
  A failing test is the best report.

You will get an acknowledgement within 7 days and, when the report is confirmed, a fix or a written plan within 30 days. The fix ships in the next release
and the advisory credits you unless you prefer otherwise. Please give us that time before you publish details.

## Supported versions

Plainkit is a pre-release (0.x): only the **latest release** (and `main`) receives security fixes. Upgrade to the newest version to get a fix; there are no
back-ports until a 1.0 release defines a support window.

## Scope

In scope:

- The SDK in `core/`: the custom elements, the page layer, the dev tools modules, the gallery, and what they do with attributes, properties, URLs, JSON
  attribute values, `postMessage` and storage (for example: script injection, a `javascript:` or `data:` address that runs, a message from another origin that is
  believed, an escape from the content security policy `script-src 'self'; style-src 'self'`).
- The Blazor package `PlainKit.Blazor` (NuGet): the interop bridge, the components, the dev tools page and its Files tool, and log forwarding (for example: the dev
  tools served outside Development without being asked for, a path outside the source root read, data sent to a place other than the app).
- The release path: the workflows in `.github/workflows`, the package contents and their integrity manifest.

Out of scope:

- Your application's own code, its authentication and authorisation, and the way you build the values you pass to an element (a `Href` you build from user input
  should still be checked by your app; Plainkit drops script addresses as a second line of defence, not the first).
- The development server `core/tools/serve.mjs` when you deliberately bind it to a public address with `--host=` (it is for local use).
- Findings that need a modified copy of the package or a hostile developer machine, and reports from automated scanners without a demonstrated effect.
- The sample applications' demo data.

## What the project does about security

The CSP-compatible design (no inline script or style, no third-party requests), the repository scanner (`node core/tools/security.mjs`), the tests under
`core/tests/` (`security.test.mjs`, `safe-url.test.mjs`, `serve-security.test.mjs`) and `scripts/tests/supply-chain.test.mjs`, dependency updates through Dependabot,
and a scheduled code scanning workflow. Releases are built by CI from a version tag; the package and the `core/dist` manifest carry SHA-384 hashes.
