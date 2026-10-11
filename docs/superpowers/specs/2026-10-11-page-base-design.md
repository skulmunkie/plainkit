# Page base and component base: lifecycle, cancel, busy/error, dispose (#1022, #855, #423)

Status: design for the owner to confirm before anything is built. Nothing here is implemented by this document.

## 1. Problem

Three issues ask for one idea at three levels and are each too big to start.

- **#1022** wants a Blazor page base *and a component base* with lifecycle hooks: a load hook that runs on first render and on route-parameter change with a cancellation token cancelled on navigation or disposal, busy/error around `RunAsync(action, label)`, a safe `InvokeStateChanged` that is a no-op after disposal, a dispose hook; documented in the skill and flagged by the consumer audit when hand-rolled.
- **#855** wants the template-owned stack, toast host and `ShowSuccess/ShowError/ShowWarning` helpers.
- **#423** wants a shared page-shell base in core (title bar with breadcrumb and actions, tabs, a state region, a content area scoped to the active tab) that page types compose.

Hand-written lifecycle code is where the subtle bugs live: a render at the first await that draws stale state, work that outlives navigation, updates after disposal. The fix is one tested implementation of the rules, with the Blazor type a thin wrapper (`blazor/handwritten.json` rules, #801).

## 2. What exists (read before proposing)

**Core, already shared:**

- `core/js/page.js` (`createPage`): title, status/alert, counted busy with `begin/end/busy(fn,label)`, a framework-owned `pk-loading-overlay` with `BUSY_DELAY` 150 ms and `BUSY_MIN_TIME` 300 ms, breadcrumbs from a router, `destroy()` releasing every token. Its header says the Blazor `PageBase` is meant to share this model.
- `core/js/page-states.js`: the shared loading/empty/error/forbidden state region used by `tool`, `settings`, `states`.
- `core/js/app/host.js` and `module.js`: tracked resources per scope (`on`, `observe`, `after`, `signal`) and a navigation token so a newer request cancels an older one in flight (`ctx.signal` aborts). So **cancel on navigation and on dispose already exists in the JS app framework**, as an `AbortSignal`.
- `core/js/app/pages/*.js` (page types `record`, `list`, `tool`, `settings`, `states`, `wizard`...), each a small factory that builds a `pk-*-page` element and calls `mountTitled` from `js/page-shell.js`. `svc-page-toasts.js` (#855 step 1, done) raises default saved/failed/deleted/done toasts through `ctx.notify`; `svc-leave-guard.js` guards unsaved edits. Both are lazy chunks, outside the app entry graph.
- `core/js/page-context.js` and its C# port `PkPageContext` (#670) with the shared fixture `core/tests/fixtures/page-context.json`: the precedent for "rules in core, port proven by one fixture". See also `2026-10-08-page-toasts-design.md` for the style and the lazy-chunk budget argument.

**Blazor, hand-written (`blazor/handwritten.json`, budgets in `blazor/handwritten.baseline.json`):**

- `PageBase.cs` (149 lines): title, crumbs, status, counted busy (`BeginBusy`, `BusyAsync`, `BusyLabel`), `SetErrorAsync` through `IPkLog`, `IDisposable`. `PageBase.Toasts.cs` (32): `ShowSuccess/Warning/Error` over `IPkNotifications` (the Blazor half of #855, done). It is a hand port of `createPage`'s busy model with no fixture tying the two together.
- `PkRecordEditor.cs` (159) and `PkRecordEditor.Toasts.cs` (40): load/validate/save/delete state with its own `Busy` flag and `Error`; default toasts exist.
- `PkCallbackSlot.cs` (77): the per-call `CancellationTokenSource` plumbing for element callbacks. `PkDataTable` and `PkLookupPicker` already get superseded-request cancellation through it (`PkListRequest.CancellationToken`).
- The generated `PkRecordPage.razor` and `PkListPage.razor`, and `PkListPageQuery.cs`.

**Finding on the expected "debt".** `handwritten.baseline.json` has a budget for every file and exactly one debt entry (`layout-recipe` in `PkDevToolsPage.razor`). It lists **no** timer, stale-load-guard or retry-loop debt. The debounce is the element's own timer (`search-debounce`), supersession is `PkCallbackSlot`, and `PkAppBarSearch.Debounce` is a pass-through. So this design lowers budgets (`PageBase`, `PkRecordEditor`) rather than deleting debt entries; the real saving is in **consumer apps**, which hand-roll `CancellationTokenSource` + `IDisposable` + busy/error fields (the #1022 evidence).

**Gaps.** (a) `PageBase` has no load lifecycle: it never loads, cancels, or guards a stale result; (b) no component-level base; (c) no safe refresh after disposal; (d) no core helper for "load with a signal, supersede on param change" outside the `record`/`list` page types; (e) #423's shared shell: each `pk-*-page` assembles `pk-page-header`, `pk-tabs` and `page-states.js` by hand.

## 3. Proposed base

### 3.1 Core: `js/page-lifecycle.js` (lazy, outside the app entry)

One framework-free helper holding the rules; page types use it, and the Blazor tests use its fixture.

```js
const life = createLifecycle({ page, signal });   // page = createPage(...) or null, signal = ctx.signal
life.load(key, async (signal) => data);            // runs now; a later load aborts the earlier signal and drops its result
life.run(label, async (signal) => value);          // counted busy; error to the page status; no-op after destroy
life.state;  life.error;                           // 'idle' | 'loading' | 'ready' | 'error'
life.refresh();                                    // re-run the last load (safe: a no-op after destroy)
life.destroy();                                    // aborts, releases busy tokens, makes every later call a no-op
```

Rules (each becomes a test): a result from a superseded or destroyed load is never applied (a generation check, because not every API honours the signal); an aborted call is not an error and raises no toast; `run` rejects to its caller *and* sets the status once (as `BusyAsync` does); `load` reports `loading` synchronously, before the first await, so no first render draws stale state; destroy is idempotent; no timers (the overlay's two timeouts stay in `createPage`).

### 3.2 Blazor: `PageBase` and `PkComponentBase`, thin

```csharp
public abstract class PkComponentBase : ComponentBase, IAsyncDisposable
{
    protected virtual Task OnLoadAsync(CancellationToken cancel) => Task.CompletedTask; // first render and on parameter change
    protected virtual bool ReloadOnParameters => true;
    protected virtual ValueTask OnDisposeAsync() => ValueTask.CompletedTask;
    protected CancellationToken LoadCancellation { get; }   // cancelled on the next load and on dispose
    protected bool IsLoading { get; }
    protected Exception? LoadError { get; }
    protected Task RunAsync(Func<CancellationToken, Task> action, string? label = null); // counted busy + error
    protected Task InvokeStateChanged();                     // a no-op after dispose; marshals through InvokeAsync
}
public abstract partial class PageBase : PkComponentBase { /* existing: Title, Crumbs, Status*, BusyAsync, Show* toasts */ }
```

Implementation: one small internal `PkLifecycle` class (CTS per load, generation counter, disposed flag, busy tokens), about 90 lines, held by `PkComponentBase`; `PageBase` shrinks by the busy code it moves. `SetParametersAsync` cancels the previous load, starts the next with a fresh token, and calls `OnLoadAsync` when a parameter changed. `IsLoading` is true before the first await returns control, so the first render shows the loading state, not a default model. Exceptions other than `OperationCanceledException` become `LoadError`, are logged through `IPkLog` and shown through the existing danger status; cancelled loads are silent. Toast helpers stay in `PageBase.Toasts.cs`.

Why a hand class and not generated from, or called into, `page-lifecycle.js`: a Blazor lifecycle is the framework's (`SetParametersAsync`, `DisposeAsync`), so there is nothing to call across interop. What core owns is the **rules**, shared by a **fixture** (`core/tests/fixtures/page-lifecycle.json`: scripted load/supersede/run/destroy events with expected states) read by the Node suite and the xUnit suite, exactly as `page-context.json` is. That is what "thin" means here.

### 3.3 Shared shell (#423)

Extract, do not invent: a composed element `pk-page-shell` (tier `component`, built from `pk-page-header`, `pk-tabs` and the `page-states.js` module) with slots `breadcrumb`, `actions`, `tabs`, `state` and the default content. `tool`, `settings` and `states`, then `record`/`list`, stop re-assembling the four pieces. Tabs: one content region; the page type swaps what it renders on the tab-change event. A whole-page state (loading, error) replaces the content; a per-tab state is the page type's own concern. Blazor gets `PkPageShell` from the generator (no hand-written file), and `PageBase.Title`/`Crumbs` bind into it. The outer spacing stack of #855 is the shell's, so templates declare none.

### 3.4 Audit

A consumer rule (`core/tools/audit`): a component that implements `IDisposable`/`IAsyncDisposable` and declares a `CancellationTokenSource`, or has busy/error fields beside an `OnInitializedAsync`, gets a finding with `FIX:` "inherit `PageBase`/`PkComponentBase` and override `OnLoadAsync`". Warning first.

## 4. Alternatives

| Option | For | Against |
| --- | --- | --- |
| A. Proposed: rules in core plus fixture, thin C# bases over one internal `PkLifecycle` | no interop cost, idiomatic Blazor, drift guarded by a fixture | two implementations of about 100 lines (the same cost as `PkPageContext`) |
| B. Generate the C# base from `page-lifecycle.js` | one source | a transpiler for async/AbortSignal semantics is more code than the class |
| C. Lifecycle by interop to `createLifecycle` | literally one implementation | a round trip per load and cancel, circuit latency; Blazor's `CancellationToken` is the natural handle |
| D. One base for pages and components | less API | a card must not carry title, crumbs, status and toasts; instead `PageBase : PkComponentBase` so the lifecycle exists once |
| E. A `<PkPage Load=...>` wrapper instead of inheritance | no `@inherits` | callbacks hide `this` state; #1022 acceptance says "only markup and an overridden load hook"; can be added later over the same class |
| F. Skip the shell (#423) | smaller | it is the bigger duplication in core and unblocks the page types; kept as separate later steps |

## 5. Non-goals

No Blazor router work (routing stays the framework's); no data-fetching or caching layer; no new toast service (#855 is done in core and Blazor); no retries or polling in the base (a retry is a button the page offers); no change to `PkCallbackSlot` semantics beyond lowering lines; no new element beyond `pk-page-shell`.

## 6. Size and budget impact

- **App entry cap (`appEntryGzKb`, 22 KB gzip, now 21.97, hard):** zero. `page-lifecycle.js` is a lazy chunk imported by page-type chunks, as `svc-page-toasts.js` and `svc-leave-guard.js` are, never from `app.js`'s static graph; `core/tests/app-budgets.test.mjs` guards it. A step that finds it must touch an entry file stops, or carries an equal cut in the same graph.
- Page layer 10 KB gzip and element budgets: untouched; `pk-page-shell` is composed from existing elements with its own budget (target under 1.5 KB gzip, tokens only).
- **Blazor baseline** (only shrinks): add `PkLifecycle.cs` (about 90) and `PkComponentBase.cs` (about 40) as hand-written entries; `PageBase.cs` 149 down to about 110 and `PkRecordEditor.cs` 159 down to about 130 (its `Busy` and `RunAsync` use `PkLifecycle`). Net new hand-written code is about +20 lines; consumer apps lose hundreds. No existing budget is raised.

## 7. Migration and breaking changes

- `PageBase` stays source-compatible: every member keeps its name and meaning. `IDisposable` becomes `IAsyncDisposable`; Blazor accepts either and the old `ReleaseBusy` is called from the new dispose. **Breaking** only for a page that casts the base to `IDisposable` or declares its own `Dispose`-by-interface; changelog `breaking`.
- `OnLoadAsync` is new and virtual; step 2 greps the repo and samples for a clashing member.
- `BusyAsync` keeps its rethrow behaviour; `RunAsync` is additive.
- JS page types: `load(id, ctx)` already has `ctx.signal`; no config change.
- Retrofitting `tool`/`settings`/`states` onto `pk-page-shell` changes shadow DOM structure; tests and scenarios that pierce those trees are updated in step 6. No public attribute changes.

## 8. Test plan

- Node: `page-lifecycle.test.mjs` over the fixture (supersede drops the old result, aborted is silent, destroy idempotent, `run` sets status once, `loading` before the first await, no timer created).
- xUnit: the same fixture through `PkLifecycle`; `PageBase` loads on first render, reloads on a changed parameter and not on an unchanged one, cancels on dispose, `InvokeStateChanged` after dispose does not throw, a faulted load sets `LoadError`.
- `scripts/tests/blazor-wrapper.test.mjs` (#801): new files listed in `handwritten.json` with a category; no timers or stale guards written in components.
- Audit: positive and negative fixtures for the new rule.
- Browser (step 5): measuring cases for the shell (breadcrumb and actions share the title row; the content region fills the remaining height; a state replaces the content); a scenario for a tab switch and a whole-page error; desktop 1280 and phone 375, light and dark; ui-review screenshots opened and checked before merge.

## 9. Proposed step plan

Each step is one issue, one branch, about 400 hand-written lines, leaves integration releasable, and states its effect on `handwritten.baseline.json`.

1. **Core lifecycle helper and fixture.** `js/page-lifecycle.js`, `page-lifecycle.json`, Node tests; `record` and `list` page types adopt it for load supersession. Entry graph 0 bytes. Baseline: none.
2. **Blazor `PkLifecycle` and `PageBase` load, cancel, dispose.** `OnLoadAsync`, `LoadCancellation`, `InvokeStateChanged`, async dispose, fixture-driven xUnit, skill workflow "write only markup and `OnLoadAsync`". `PageBase.cs` budget lowered; `PkLifecycle.cs` added at its true size.
3. **`PkComponentBase`, `RunAsync`, `LoadError`** for non-page components; `PkRecordEditor` moves its busy bookkeeping onto `PkLifecycle` (budget 159 down to about 130). Skill text and a gallery sample for a card.
4. **Consumer audit rule** for hand-rolled `IDisposable` + `CancellationTokenSource` + busy/error fields, with fixtures and a `FIX:` pointing at the bases; warning severity.
5. **`pk-page-shell` element** (#423): slots, tabs/state/content rules, generated `PkPageShell` (no hand-written file), mapping JSON, gallery example, browser cases, scenario, ui-review.
6. **Retrofit page types onto the shell.** `tool`, `settings`, `states` (and `record`/`list` as a 6b if over budget); the Blazor skill's recommended page binds `Title`/`Crumbs` into the shell. Scenario updates; any entry-graph effect offset in the same PR.

Steps 3 and 4 may swap; 5 and 6 do not depend on 1 to 4.

## 10. Open questions for the owner

1. **#855 scope.** Core defaults and `PageBase.Show*` are merged; what remains is "the template owns the stack and toast host". Recommendation: close #855 with a note after step 3 and give the outer stack to `pk-page-shell` (step 5) instead of a second mechanism.
2. **Explicit `IAsyncDisposable`?** A small break for pages that cast to `IDisposable`. Recommendation: accept it with a `breaking` changelog entry; without it the base cannot await in-flight work on dispose.
3. **Reload trigger.** Any changed parameter, or only route parameters? Recommendation: any changed parameter (Blazor's own diff) with `ReloadOnParameters => false` to opt out; simpler to explain, fewer silently stale pages.
4. **Names.** `PkComponentBase` (matches `PkElementBase`, `PkTableBase`) with `PageBase` keeping its name and deriving from it. Recommendation: yes.
5. **`pk-page-shell` tier.** `component` is forced by C1/C4 (it composes elements); page types (tier `page`) compose it. Recommendation: confirm `component`.
6. **Audit severity.** Warning for one release then error, or error at once? Recommendation: warning first; apps need a release to migrate.
7. **Per-tab state in the shell.** Whole-page state only in v1? Recommendation: yes; a tab renders `page-states.js` inside its own panel, and a slot is added only when a real page needs it.
8. **Order.** Lifecycle (steps 1 to 4) before the shell (5 to 6)? Recommendation: lifecycle first: it answers the concrete bug class in #1022 with no entry-graph or visual-review cost, so the shell then gets the owner's full screenshot attention.
