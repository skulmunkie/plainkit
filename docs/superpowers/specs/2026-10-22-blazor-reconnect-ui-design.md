# Blazor Server reconnect UI: themed states and auto-reload (refs #1714)

Status: proposal for owner decision. Docs only; no product code, no budget change. Related: `PkApp`, `PkRuntime`, `AddPlainKit()`, `scripts/blazor-browser.mjs`.

## 1. Problem

The framework's default reconnect dialog does not match PlainKit themes and, after a server restart or deploy, stays on "Rejoin failed... trying again" forever, because the old circuit can never be resumed. The user must reload by hand, and every app repeats a script to fix it.

## 2. What exists today

- `blazor/src/PlainKit.Blazor` has no reconnect handling (only devtools circuit state, `PkCircuitState`). `PkApp` renders `PkAppFrame`; the sample `App.razor` loads `_framework/blazor.web.js` with `InteractiveServer`.
- Framework behaviour: the `#components-reconnect-modal` element receives the classes `components-reconnect-show|failed|rejected` (.NET 8, 9, 10; .NET 10 adds `retrying`, `paused`, `hide`). **Only .NET 10 raises the non-bubbling event `components-reconnect-state-changed` with `detail.state`** (corrected by the phase 1 spike, section 8: .NET 8 and 9 raise none). Retry tuning is `Blazor.start({ circuit: { reconnectionOptions, reconnectionHandler } })`, which needs `autostart="false"` on the script tag. `PlainKit.Blazor` targets `net10.0` only (`Directory.Build.props`), so .NET 10 is the contract; .NET 8 and 9 are recorded in section 8 for information.

## 3. Proposal

### 3.1 Shape (Q1): a component plus a lazy module

- **`PkReconnect` component** (small, hand-written, listed in `blazor/handwritten.json`): placed once in `App.razor`, or implied by `PkApp` when `PkOptions.Reconnect` is set. It renders the `id="components-reconnect-modal"` markup the framework drives, built from existing elements (`pk-alert` banner or `pk-dialog` when modal, `pk-button`, `pk-spinner`), so the theme applies automatically.
- **`reconnect.js`** (`core/js/reconnect.js`, pure logic importable in node): state machine and policy. `PkRuntime` loads it lazily only when `PkReconnect` renders, so apps that do not opt in pay nothing. It listens with a capture listener on `document` (the event does not bubble), added when mounted and removed on dispose.
- No inline script and no `autostart="false"` needed in v1: the listener works with the default start, **provided the `#components-reconnect-modal` element is in the page** (with none, .NET 10 builds its own default display and raises no event; section 8). Custom `reconnectionOptions` (phase 3) ship as an external same-origin file the app references, documented, never inline.
- Not a core element: it is Blazor-only. The markup is server-rendered into the initial HTML and styled by a small `reconnect.css` in the Blazor static assets (tokens only).

### 3.2 States and copy

| State | UI | Action |
| --- | --- | --- |
| `show` / `retrying` | banner: spinner, "Reconnecting...", attempt count | none |
| `failed` | "Cannot reach the server" | Retry now (`Blazor.reconnect()`), Reload; probe-then-reload (3.3) |
| `rejected` | "This session ended" | Reload (automatic after a visible delay if enabled) |
| `resume-failed` | "Your session could not be restored" | Reload (automatic). Not reproduced in the spike; handled defensively, unverified |
| `paused` | "Paused" (not tied to the tab going to the background: section 8) | Resume (`Blazor.resumeCircuit()`), automatic when visible |
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

## 8. Phase 1 findings (spike, measured 2026-10-22, issue #1714)

Method: a throwaway harness (not committed) published the app, started it on a free port, drove headless Chrome over the DevTools protocol, installed a capture listener for `components-reconnect-state-changed` on `document` plus a MutationObserver on the modal element before the page scripts ran, dropped the circuit in the ways below and logged what happened. SDK 10.0.400 built all three targets; the runtimes were 8.0.32, 9.0.19 and 10.0.11. .NET 10 was run against a minimal Blazor Server app (and the default-UI case also against the minimal app with no modal element); .NET 8 and 9 against the minimal app only (the reconnect client is the framework's, independent of PlainKit). The modal was a plain `<div id="components-reconnect-modal"></div>` in the initial HTML unless noted.

### 8.1 What the SDKs do

| | .NET 8.0.32 | .NET 9.0.19 | .NET 10.0.11 (the target) |
| --- | --- | --- | --- |
| `Blazor` members | `reconnect`, `defaultReconnectionHandler`, `disconnect` | same | adds `pauseCircuit`, `resumeCircuit` |
| `components-reconnect-state-changed` event | **never raised** | **never raised** | raised on the modal element, `bubbles: false`, `detail.state`; a capture listener on `document` sees it |
| Classes on the modal | `components-reconnect-show`, `-failed`, `-rejected` | same | `-show`, `-retrying` (added next to `-show` after the first attempts), `-failed`, `-rejected`, `-paused`, `-hide` (on recovery) |
| Server gone, host stays down | `show`, then `failed` after the retry budget (tested with `maxRetries: 3`) | same | `show`, then `retrying` events with `{ currentAttempt, secondsToNextAttempt }` about once a second; no `failed` within a 30 s outage with the defaults; `failed` after the budget with `maxRetries: 3` |
| Host back, same port | `rejected` (circuit unknown to the new process) | `rejected` | `rejected`; the page stays, clicks do nothing |
| `failed`, host comes back later | stays `failed` | same | same |

.NET 10 event states seen: `show`, `retrying` (detail adds `currentAttempt` and `secondsToNextAttempt`; repeated about every second as a countdown, so a consumer treats repeats as updates, not new states), `failed`, `rejected`, `paused` (detail `{ remote: false }` when started by `Blazor.pauseCircuit()`), `hide`. `resume-failed` was not reproduced (a pause, a host restart and `resumeCircuit()` simply gave a working circuit and returned `true`); the name stays in the machine but is unverified. .NET 8 and 9 have no `pauseCircuit`, so no pause test ran there.

### 8.2 Behaviours that change the design

- **Event vs classes.** .NET 8 and 9 raise no event, so only a class observer could cover them. `PlainKit.Blazor` is `net10.0` only, so v1 listens for the event and does not observe classes.
- **The element must exist.** With no `#components-reconnect-modal` element .NET 10 appends its own `<div id="components-reconnect-modal">` on the first disconnect and raised nothing our `document` listener saw; in that run the page also reloaded by itself once the restarted host answered. So `PkReconnect` renders the element in the initial HTML, as the spec says. As the "user specified" display it never reloads by itself: `rejected` is final and the app must reload (the point of this spec).
- **`rejected` arrives late.** It is raised when the first successful connection to the restarted host is refused, so the page sits in `retrying` while the host is down and reaches `rejected` only when the host is back (about 12 to 20 s after the restart in the spike). A host that stays down never produces `rejected`; hence the probe for `failed`.
- **`paused` is not the background tab.** Freezing and resuming the page (`Page.setWebLifecycleState`) gave `show`, `retrying` (attempt 1) and `hide` within about a second on the same circuit, never `paused`. `paused` comes from `Blazor.pauseCircuit()` (or the server). The copy "while the tab was in the background" is dropped.
- **`failed` does not self-heal.** After a long outage it stays on `failed`; `Blazor.reconnect()` or a reload is needed, so the probe-then-reload design of 3.3 is right.
- **Recovery** ends with `hide` (class `components-reconnect-hide`); the same circuit continues with its state, so no reload.

### 8.3 Dropping a circuit in the harness

| Method | Result |
| --- | --- |
| Stop the host process and start it again on the same port (`taskkill /T /F`, then a fresh `dotnet App.dll`) | **Works, the reference method.** `show`, `retrying` ..., then `rejected` once the host is back. `failed` needs a page started with `autostart="false"` and `Blazor.start({ circuit: { reconnectionOptions: { maxRetries: 3, retryIntervalMilliseconds: 300 } } })`, which also confirms the options object works as documented. |
| `Network.emulateNetworkConditions` `offline: true` | **Does not work.** The open WebSocket survives offline emulation; clicks queue and are delivered afterwards; no class or event changed. |
| `Fetch.enable` for `*_blazor*` (never answering) plus `socket.close()` from the page | **Works for `show`/`retrying` on the same circuit.** Needs a wrapper that keeps the WebSocket objects, installed before the page scripts (`Page.addScriptToEvaluateOnNewDocument`). The client retry request stays paused so the state holds at `show`, `retrying` 1; `Fetch.disable` lets it through and the circuit resumes with `hide`, state intact. `Fetch.failRequest` (a refused negotiate, expected to reach `failed`) was not tried. |
| `Page.setWebLifecycleState` `frozen` then `active` | Works: `show`, `retrying` (1), `hide` on the same circuit. Does not reach `paused`. |
| `Blazor.pauseCircuit()` then `Blazor.resumeCircuit()` (.NET 10) | Works: `show`, `paused` (`remote: false`), then `hide`; also across a host restart. |

For the later phases: the lab case for `rejected` and `failed` uses the host restart (and a lab page that starts Blazor with a short `maxRetries` for `failed`); `Fetch.enable` or the lifecycle freeze give a fast `show`/`retrying` without restarting the host; `paused` comes from `pauseCircuit()`. Phase 2's component must put the modal element in the server-rendered HTML.

## 9. Phase 2 as built (#1714)

- **Where the banner is built.** The banner markup is built by `wwwroot/plainkit.reconnect.js` (a Blazor static asset, not in the npm package) from `pk-alert banner`, `pk-spinner` and `pk-button`, so `PkReconnect.razor` is only the `#components-reconnect-modal` element, its options as one `data-pk-reconnect` attribute and a module script. The thin-wrapper rule (`scripts/tests/blazor-wrapper.test.mjs`) forbids `PkApp` composing a second component, so `PkApp` does not render `PkReconnect`: when `PkOptions.Reconnect` is set it calls the bridge (`startReconnect`, through `PkRuntime.StartReconnectAsync`), and the driver creates the element itself. The spike confirmed .NET 10 finds an element created after the circuit started.
- **Loading.** The module script runs on a prerendered or static page; the bridge call covers an interactive-only page. Both are idempotent (a `data-pk-started` marker also covers the plain and the fingerprinted URL being two modules); the driver restarts on a replaced element and `PkReconnect` stops it on dispose.
- **Focus and the phone.** Non-modal (default): focus is left alone. `Modal`: everything outside the banner becomes `inert`, Reload takes focus on `failed` and `ended`, and the earlier focus returns on `hide`. Coarse pointers get 44 px buttons; icon-only buttons on a phone are not done (the buttons keep their text).
- **Checks.** `core/tests/reconnect.test.mjs`, `scripts/tests/blazor-reconnect.test.mjs` (what each view shows), `PkReconnectTests` (bUnit), and the harness case `reconnect-banner` (a real socket drop held with `Fetch.enable`, then each state raised the way the framework raises it, plus screenshots `blazor-app__reconnect-*`). The host-restart cases (`rejected` end to end, the automatic reload landing on a fresh circuit, the loop guard) are phase 3.
