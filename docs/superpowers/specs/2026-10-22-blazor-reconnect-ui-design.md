# Blazor Server reconnect UI: themed states and auto-reload (refs #1714)

Status: proposal for owner decision. Docs only; no product code, no budget change. Related: `PkApp`, `PkRuntime`, `AddPlainKit()`, `scripts/blazor-browser.mjs`.

## 1. Problem

The framework's default reconnect dialog does not match PlainKit themes and, after a server restart or deploy, stays on "Rejoin failed... trying again" forever, because the old circuit can never be resumed. The user must reload by hand, and every app repeats a script to fix it.

## 2. What exists today

- `blazor/src/PlainKit.Blazor` has no reconnect handling (only devtools circuit state, `PkCircuitState`). `PkApp` renders `PkAppFrame`; the sample `App.razor` loads `_framework/blazor.web.js` with `InteractiveServer`.
- Framework behaviour (.NET 8 to 10): the `#components-reconnect-modal` element receives the classes `components-reconnect-show|failed|rejected` (newer SDKs also `retrying`, `paused`, `resume-failed`) and the non-bubbling event `components-reconnect-state-changed` with `detail.state`. Retry tuning is `Blazor.start({ circuit: { reconnectionOptions, reconnectionHandler } })`, which needs `autostart="false"` on the script tag. State names and the template differ per .NET version; phase 1 records them on each targeted SDK.

## 3. Proposal

### 3.1 Shape (Q1): a component plus a lazy module

- **`PkReconnect` component** (small, hand-written, listed in `blazor/handwritten.json`): placed once in `App.razor`, or implied by `PkApp` when `PkOptions.Reconnect` is set. It renders the `id="components-reconnect-modal"` markup the framework drives, built from existing elements (`pk-alert` banner or `pk-dialog` when modal, `pk-button`, `pk-spinner`), so the theme applies automatically.
- **`reconnect.js`** (`core/js/reconnect.js`, pure logic importable in node): state machine and policy. `PkRuntime` loads it lazily only when `PkReconnect` renders, so apps that do not opt in pay nothing. It listens with a capture listener on `document` (the event does not bubble), added when mounted and removed on dispose.
- No inline script and no `autostart="false"` needed in v1: the listener works with the default start. Custom `reconnectionOptions` (phase 3) ship as an external same-origin file the app references, documented, never inline.
- Not a core element: it is Blazor-only. The markup is server-rendered into the initial HTML and styled by a small `reconnect.css` in the Blazor static assets (tokens only).

### 3.2 States and copy

| State | UI | Action |
| --- | --- | --- |
| `show` / `retrying` | banner: spinner, "Reconnecting...", attempt count | none |
| `failed` | "Cannot reach the server" | Retry now (`Blazor.reconnect()`), Reload; probe-then-reload (3.3) |
| `rejected` | "This session ended" | Reload (automatic after a visible delay if enabled) |
| `resume-failed` | "Your session could not be restored" | Reload (automatic) |
| `paused` | "Paused while the tab was in the background" | Resume (`Blazor.resumeCircuit()`), automatic when visible |
| `hide` | banner removed, focus restored | |

Strings come from `PkReconnectOptions` (localisable). `rejected` and `resume-failed` mean the circuit is gone: reloading is always right. `failed` may be a transient outage, and a reload could land on the browser error page.

### 3.3 Auto-reload policy (Q2 to Q4)

`AutoReload`: `Never` | `Gone` (rejected, resume-failed) | `Always` (default `Gone`). For `failed` under `Always`, probe a same-origin URL (default `/`, `HEAD`, `cache: 'no-store'`, 3 s timeout) with exponential backoff and jitter (1, 2, 4, 8, 15, 30 s cap) for about 5 minutes and reload as soon as the probe succeeds; otherwise stay on `failed` with the manual button and "Still trying". Loop guard: at most 3 automatic reloads per 60 s (`sessionStorage` counter inside try/catch; beyond it, stay on the failed state). Because a reload loses unsaved form state, an automatic reload from `rejected` shows a visible 5 s countdown with Cancel. Probing runs only while the tab is visible; timers clear on `hide` and dispose.

### 3.4 Accessibility and CSP

- One polite live region (`role="status"`) announces each state change once; `failed` and `rejected` use `role="alert"` once. Non-modal by default (no trap); the Reload button is early in tab order while shown and focus returns to the prior element on `hide`. `Modal=true` uses `pk-dialog` for apps that must block input.
- Native buttons, at least 44 px on phone, icons only on phone with names. Spinner stops under `prefers-reduced-motion`.
- CSP: no inline script or style; same-origin module, same-origin `fetch` probe, `location.reload()`. Nothing leaves the origin.

### 3.5 Size and ownership

Component about 60 lines; `reconnect.js` about 1.2 KB gzip, lazy; CSS under 0.5 KB gzip. If core packed headroom cannot take it, the file ships in the Blazor static assets only (not the npm package), since only Blazor Server needs it. Timers and listeners follow the ownership rules; stale-probe guards live in `reconnect.js`, not Razor.

## 4. Tests

- Node: state machine (events in, UI state and actions out), backoff schedule and jitter bounds, loop guard, copy options.
- bUnit: `PkReconnect` renders the framework ids and classes, option passthrough, no inline script or style.
- **Blazor browser harness (new `/lab/reconnect` page and cases in `scripts/blazor-browser-lab-cases.mjs`):** it already drives a real host over the DevTools protocol, so it can drop a circuit: (a) block `/_blazor` or take the page offline (CDP `Network.emulateNetworkConditions`) to reach `show` then `failed`; (b) stop and restart the host on the same port to reach `rejected` or `resume-failed` and assert the automatic reload gives a fresh working circuit; (c) `Page.setWebLifecycleState frozen` for `paused`. Cases measure the banner visible, live-region text, Reload focusable, the loop guard, the probe schedule (short intervals through an options seam on the lab page), no console errors. Screenshots per state, desktop and phone, light and dark, are opened and read.
- Event names across .NET versions are only verified by real runs, hence the phase 1 spike.

## 5. Phases (about 400 lines each)

1. Spike and logic: record real events per SDK, `reconnect.js` state machine, backoff, guard, node tests (about 300).
2. `PkReconnect`, CSS, `PkOptions.Reconnect`, sample wiring, bUnit, handwritten.json entry (about 250).
3. Harness lab page and cases, screenshots, optional custom `reconnectionOptions` start file (about 350).
4. Docs, skill workflow, changelog.

## 6. Alternatives rejected

- Documenting a consumer script only: every app repeats it and trips on the non-bubbling event.
- Replacing the framework's reconnection handler in v1: more surface to maintain per .NET version; listen first.
- Unconditional auto-reload on `failed`: lands on the browser error page during an outage.

## 7. Decisions needed

1. **Shape:** `PkReconnect` component plus lazy `reconnect.js` and CSS, opt-in (placed, or `PkOptions.Reconnect`)? Recommend yes; `PkApp` implies it only when the option is set.
2. **Auto-reload default:** `Never`, `Gone` or `Always`? Recommend `Gone`, with probe-then-reload for `failed` behind `Always`.
3. **Backoff:** same-origin `/` probe, 1 to 30 s exponential, about 5 minutes, max 3 reloads per 60 s? Recommend yes.
4. **Unsaved work:** a 5 s visible countdown with Cancel before an automatic reload? Recommend yes.
5. **Modal or banner:** non-modal banner default, `Modal=true` option? Recommend yes.
6. **Custom `Blazor.start` options (retry interval, own handler):** v1 or later? Recommend later (phase 3); listener-only first.
7. **.NET versions to cover:** 8, 9 and 10, or only what `PlainKit.Blazor` targets? Recommend the targeted versions, verified in phase 1.
