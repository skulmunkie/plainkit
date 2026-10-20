# pk-barcode-scanner: camera capture and barcode decode (refs #1699)

Status: proposal for owner decision. Docs only; no product code, no budget change. Related: #1656 (separate packages), tracker #336, `pk-dropzone`, `pk-input`.

## 1. Problem

Apps that look products up by UPC/EAN at a desk or in a warehouse hand-write a `getUserMedia` video, a decode loop (`BarcodeDetector` plus a fallback library), start/stop and permission handling, torch and camera switch, a live/idle status and a debounce so one code is not reported repeatedly. It is a few hundred lines per app and hard to get right on iOS Safari and Android Chrome. Use cases: scan to fill a search or SKU field, scan many items in a row (receiving, stocktake), scan a QR code (bin label, sign-in).

## 2. What exists today

- No element touches `getUserMedia`, `mediaDevices` or `BarcodeDetector`. `pk-dropzone` takes files only; `pk-input` has no scan affordance.
- Patterns to follow: lazy elements loaded by tag (`js/loader.js`), `this.log`/`this.warnOnce`, subscriptions added in `connected()` and removed in `disconnected()` (STANDARDS, "Ownership and reactivity"), CSP `script-src 'self'; style-src 'self'` (no inline script or style, no cross-origin requests).
- Package plan (#1656): an extra is at least 8 KB gzip packed and Need 4 to 5, one lockstep version, registered by tag through `registerExtra`. A decoder fallback qualifies many times over.

## 3. Proposal

### 3.1 `pk-barcode-scanner` (tier `component`: renders `pk-button`, `pk-alert`, `pk-input`; Q2)

The element owns its shadow tree: a `<video muted playsinline>`, a viewfinder frame, a status line (`role="status"`) and a toolbar (torch, switch camera, pick image, stop/start). The host owns attributes and light-DOM children.

| Prop (reflected) | Default | Meaning |
| --- | --- | --- |
| `active` | `false` | camera on. Never starts by itself on connect; the page sets it from a user gesture (required on iOS) |
| `formats` | `ean-13 ean-8 upc-a upc-e code-128 qr-code` | space list of `BarcodeDetector` format names; unknown names `warnOnce` |
| `facing-mode` | `environment` | `environment` or `user`; the switch button toggles it and fires `change` |
| `continuous` | `false` | false: stop after the first accepted scan; true: keep scanning |
| `dedupe-ms` | `2000` | the same value+format is not reported again within this window, and again only after it left the view |
| `torch` | `false` | request torch when the track supports it; button hidden otherwise |
| `manual` | `true` | show a "Type the code" field (a `pk-input`), the keyboard and no-camera path |
| `fallback` | `auto` | `auto`, `native` (never download a decoder) or `decoder` (force it) |

Events (bubbling, composed, typed in `elements.d.ts`): `scan` `{ value, format, source: 'camera'|'image'|'manual' }`; `error` `{ code: 'denied'|'no-camera'|'insecure'|'unsupported'|'in-use'|'decoder-failed', message }`; `status` `{ state: 'idle'|'starting'|'scanning'|'paused'|'error', engine: 'native'|'decoder' }`; `change` (facing, torch).
Methods: `start()`, `stop()`, `scanImage(file|blob|ImageBitmap)` (resolves to results; also behind the "pick image" button). Slots: `idle` (shown before start; default a "Start camera" button), `error` (replaces the message), `actions` (extra toolbar items). Hooks: `--pk-barcode-scanner-aspect`, `-frame`, `-overlay`; `part=video|frame|status|toolbar`.

Lifecycle: `start()` calls `getUserMedia({ video: { facingMode, width: {ideal: 1280}, height: {ideal: 720} }, audio: false })`; `stop()` stops every track and clears `srcObject`. Tracks also stop on `disconnected()`, `pagehide` and `visibilitychange` hidden (resume on visible if `active` is still true). A stream that resolves after disconnect is stopped at once (stale-start guard lives in the element, not in Blazor). Decode runs at most about 8 frames per second via `requestVideoFrameCallback` (fallback: throttled `requestAnimationFrame`), only while the element is visible (`IntersectionObserver`).

### 3.2 `pk-input` scan affordance

Not in v1 (Q4). A built-in scan button would make a lower tier render a component (C1/C4). v1 documents a recipe: a `pk-dialog` containing the scanner, `scan` writing the value into the input.

### 3.3 Blazor

`blazor/mappings/barcode-scanner.json`: parameters `Active`, `Formats`, `FacingMode`, `Continuous`, `DedupeMs`, `Torch`, `Manual`, `Fallback`; events `OnScan` (typed args: Value, Format, Source), `OnError`, `OnStatus`, `OnChange`; methods `StartAsync`, `StopAsync`, `ScanImageAsync` (generator method support, else `extra: true` entries). Generated 1:1 as `PkBarcodeScanner`, no hand-written code; `[PkRequiresExtra("scanner")]` once the split lands. Dedupe, stale-start and stop-on-dispose are all in core JS.

## 4. Browser API choices

1. **Native first: `BarcodeDetector`** (Shape Detection API). Chrome and Edge (Android, desktop), Safari partly and unevenly by format, not Firefox. Detect `'BarcodeDetector' in globalThis`, intersect `getSupportedFormats()` with `formats`. Zero decoder bytes, zero download.
2. **Fallback: a lazy decoder**, only when native is missing or lacks a requested format. Same-origin files only under `script-src 'self'`; **never a CDN or any third-party request**. Candidates (sizes are typical published figures, to be replaced by the phase 2 spike's measurements):
   - **zxing-wasm** (reader build; zxing-cpp is Apache-2.0): about 200 to 280 KB gzip including `.wasm`; all formats, fast, best on damaged 1D codes. WASM needs `'wasm-unsafe-eval'` in `script-src` under strict CSP, which the site's CSP does not have (Q3).
   - **ZXing-js, pure JS** (Apache-2.0): about 150 to 200 KB gzip full; a trimmed 1D+QR reader perhaps 60 to 90 KB; 3 to 5 times slower and less tolerant of blur; no CSP change; upstream maintenance has slowed.
   - **zbar (LGPL-2.1)**: small (about 100 KB gzip) and good on EAN/UPC, but LGPL conflicts with the copy-the-files, no-build distribution. Rejected on licence.
   - **jsQR (Apache-2.0)**: about 15 KB gzip, QR only. A possible tiny engine for `formats="qr-code"`.
   - **Recommendation:** trimmed pure-JS ZXing as the default decoder (no CSP change); zxing-wasm only as an opt-in engine if the owner accepts the CSP directive and real labels need it. One internal interface (`decode(ImageData, formats) -> results`) so engines swap. Decoding runs in a same-origin **module Worker** (`worker-src` falls back to `script-src 'self'`), frames transferred, never sent anywhere.
3. A browser case asserts no request leaves the origin during a scan. The decoder's licence text ships in a third-party notice file; `privacy.test.mjs` and the security allow-list stay clean.

## 5. Camera UX and states

- **Secure context.** `getUserMedia` needs HTTPS or localhost. Otherwise: `error.code='insecure'`, "The camera needs a secure (HTTPS) page", manual field shown; the API is not called.
- **Permission prompt.** Triggered only by `start()` from a user gesture. The `idle` slot explains why the camera is wanted in the page's words. `navigator.permissions.query({name:'camera'})` where it exists reports `denied` early; Safari lacks it, so rely on the rejection (`NotAllowedError`).
- **Denied:** "Camera access is blocked. Allow it in the browser's site settings, or type the code", manual field focused, no auto-retry. **No camera** (`NotFoundError`): same, plus image picker. **In use** (`NotReadableError`): "Another app is using the camera". **Unsupported**: manual and image only.
- **Camera selection.** `facing-mode` is a constraint; on devices with several cameras the switch cycles `enumerateDevices()` video inputs (labels exist only after permission). The chosen device is kept for the element's life only, never stored.
- **Torch and zoom.** After the track exists, read `getCapabilities()`; show torch only when supported (`applyConstraints({advanced:[{torch:true}]})`, Chrome Android; not iOS Safari). A zoom slider from `capabilities.zoom` is a v1.1 item, hidden when unsupported.
- **File and image fallback.** "Pick image" creates an `<input type=file accept="image/*" capture>` in code (no inline handler) and feeds `scanImage()` with `source:'image'`. This is the path for denied, absent or insecure. No match: "No code found in this image".
- **Single vs continuous.** Single: first accepted code, `scan`, `stop()`, confirmation state. Continuous: keep running, dedupe per `dedupe-ms` and re-arm when the code leaves the frame, a brief highlight. No sound or vibration from the element (Q7).
- Scan-line animation off under `prefers-reduced-motion`.

## 6. Privacy and security

No frame leaves the device; nothing is stored (no images, no history, no device ids in storage). `audio:false`. Decoding uses an offscreen canvas or bitmap dropped on stop. Tracks stop on every exit path (3.1), so the browser recording indicator goes off. Decoded values are untrusted: reported only as `detail.value`, rendered with `textContent`, never navigated, evaluated or opened by the element; docs warn that a QR value may be a URL the app must validate. Deployment docs note `Permissions-Policy: camera=(self)` and `allow="camera"` for iframes. No cross-origin requests; the video source is a `MediaStream`, so `media-src` is unaffected.

## 7. Accessibility

- A scanner is a visual task: the **keyboard and screen-reader alternative is the manual field** (visible by default; `manual=false` only when the page provides its own input) and the image picker, both in tab order before the toolbar.
- Focus: starting does not steal focus; on `error` focus goes to the recovery action (manual field); stopping returns focus to the start button.
- One polite live region: "Camera on, point at a barcode", "Scanned 0123456789012 (EAN-13)", "Camera blocked ...". Continuous mode announces each new code, not repeats. The video is `aria-hidden`; the frame is decorative.
- Toolbar buttons have names ("Turn torch on", "Use the other camera") with `aria-pressed`; targets at least 44 px on phone; icons only on phone, text on large (owner rule).
- Overlay contrast checked against a dark backdrop in both themes (UI review audits).

## 8. Package and size decision

- Native path only: the element is about 2.5 to 3.5 KB gzip (state machine, constraints, UI), inside the 4 KB element limit.
- With a decoder the family is roughly 70 to 300 KB gzip depending on engine: far over any core budget. Budgets are not raised.
- **Recommendation: a separate extra, `@plainkit/scanner` (Blazor option `scanner`).** Contents: `pk-barcode-scanner`, `js/scanner/*` (engine detection, native engine, worker, decoder interface, notice file), its metadata and skill text. Depends on `plainkit` (exact), registered by tag. The decoder and worker are separate lazy chunks fetched on first fallback use, so a Chrome user downloads only the element. Own ceiling at first publish, ratcheted down.
- If #1656 phase 2 (`registerExtra`) is not merged yet, phases 1 and 3 land under `core/` with the decoder phase held until the extra exists (the decoder never enters the core package), and nothing public changes when the files move (tag, props, events fixed).
- Not a module (`core/modules`, the tools unit): modules are mounted tools; this is a tag with a wrapper, the extra shape.

## 9. Alternatives rejected

- Only a scan button on `pk-input`: the hard parts (streams, permissions, decode) are the product.
- A hosted or CDN decoder SDK: breaks privacy and CSP.
- Decoder in core: blows the budgets for a rare need.
- Native `BarcodeDetector` only: Firefox and part of Safari get nothing, which is the issue's complaint.
- `<input type=file capture>` only: no live scanning; kept as fallback.
- LGPL zbar: licence.
- Auto-start the camera: prompts without a gesture are blocked or distrusted (iOS).

## 10. Test plan

A browser suite cannot use a real camera. Seams, documented and not public API: `PkBarcodeScanner.sourceFactory` (returns the `MediaStream`; default `getUserMedia`) and `scanImage()`.
- **Synthetic stream:** a test `<canvas>` drawing a generated EAN-13 or QR, `captureStream()` into the factory, so the real video, decode loop and worker run. Committed PNG fixtures in `core/tests/fixtures/barcodes/` for `scanImage`. One nightly end-to-end case with Chrome fake-device flags (`--use-fake-device-for-media-stream --use-file-for-fake-video-capture`) where the runner allows launch flags.
- **Measuring cases:** one `scan` per held code, a second only after it leaves the frame; `continuous=false` ends every track (`readyState==='ended'`); removal ends tracks and a late `getUserMedia` stream is stopped; hidden page pauses; factory rejections (`NotAllowedError`, `NotFoundError`, `NotReadableError`) and a stubbed insecure context give the right `error.code`, text, live-region content and focus; `formats` filtering; native path chosen when `BarcodeDetector` exists, decoder when deleted from `globalThis`; no cross-origin request (a fetch spy and Performance entries); torch hidden without the capability, shown with a faked track; manual entry fires `scan` with `source:'manual'`; no inline style or script, and the worker loads under `script-src 'self'`.
- **Scenarios** `barcode-scanner-*.js`: idle, scanning with frame, denied, no-camera, continuous highlight; desktop/phone, light/dark, RTL; a canvas stream stands in for video.
- **Node:** formats parsing, event detail shape, dedupe state machine, engine selection, decoder interface against fixtures, mapping, bUnit passthrough. Real iOS Safari and Android Chrome checks are a manual checklist in the PR.

## 11. Phases (about 400 lines of hand-written source each)

1. Native engine and element: props, lifecycle, permission and error states, manual entry, live region, dedupe, meta, gallery example, node tests (about 400).
2. Decoder: interface, worker, chosen fallback (a spike first, measurements recorded on the issue), `scanImage`, image picker, notice file (about 350 hand-written; vendored code listed, not counted).
3. Torch, camera switch, `sourceFactory` seam, browser cases, scenarios, UI review shots (about 400).
4. Blazor mapping and bUnit, docs (the `pk-dialog` recipe), skill workflow, changelog, package declaration for `scanner` (about 250).
5. Zoom and optional `pk-input` affordance, decided after use.

## 12. Open questions for the owner

1. **Package:** `@plainkit/scanner` from day one, sequenced after #1656 phase 2, or in core until then? Recommend the extra; hold the decoder until the mechanism exists, and build the native phase in core only if a consumer needs it sooner.
2. **Tier:** `component` or `element`? Recommend `component` (it reuses `pk-button`, `pk-alert`, `pk-input`; an `element` would hand-roll them).
3. **CSP and engine:** accept `'wasm-unsafe-eval'` for an opt-in zxing-wasm engine, or pure JS only? Recommend pure-JS ZXing by default and no CSP change; add wasm only if real labels demand it, opt-in.
4. **`pk-input` scan affordance:** this issue or a follow-up? Recommend follow-up (a `pk-dialog` recipe covers v1; tier rules make a built-in button awkward).
5. **Licence:** accept Apache-2.0 ZXing code with a third-party notice, never LGPL? Recommend yes.
6. **Default formats:** retail set (EAN/UPC, Code 128, QR) or all? Recommend the retail set; fewer formats decode faster with fewer false reads.
7. **Haptics and sound on scan:** v1 or left to the app? Recommend left to the app; the `scan` event is enough.
