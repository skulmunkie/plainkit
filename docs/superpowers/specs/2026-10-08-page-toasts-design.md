# Page toasts: default saved / failed / deleted messages, and a thin Blazor base (#855)

Status: design for the owner to confirm before anything is built. Decision already taken (owner): a core toast service plus a thin Blazor base.

## 1. What exists today (so nothing new is invented)

- **Core already has the toast service.** `js/notify.js` (`createNotify`) puts short messages in the single bottom-end `pk-toast-stack` that the task manager also uses (`toastStack()` in `js/tasks.js`). `ctx.notify.info|success|warn|error(title, details?, opts?)` exists on every page and module context (`js/app/host.js`, scoped per module). Kinds and durations (info and success 4 s, warn 8 s, error sticky), de-duplication of an identical kind and title within 2 s, a cap on kept toasts, untrusted text set as properties, and a bad call logged, never thrown, are all there. It is a **lazy chunk** (`js/app/pages/svc-notify.js`, #514): the app entry pays nothing until the first call.
- **The element already does the accessibility.** `pk-toast` is `role="alert"` for `danger` and `warning`, `role="status"` (polite) for `info` and `success` (`elements/toast/toast.js`, `roleFor`).
- **Blazor already has the host and the calls.** `PkToast` / `PkToastStack` (generated) and `IPkNotifications` (`InfoAsync`, `SuccessAsync`, `WarnAsync`, `ErrorAsync`, a title, optional details and duration) which route to the same SDK stack. `PageBase` already keeps only the busy count and label (the overlay owns the timing, #682) and a `SetStatus` inline alert.
- **What is missing is only the defaults.** The `record` page type fires `pk-record-save` but nobody toasts; the `list` page awaits `onBulk` and reloads silently; `PkRecordEditor` has Save/Delete/Error state but every page writes its own `Notifications.SuccessAsync("Saved")`. The sample `routed-pair` calls `ctx.notify.success('Saved')` by hand.

So **no new element and no new service**: the work is (a) defaults raised by the page types through `ctx.notify`, (b) the same defaults in `PkRecordEditor`, (c) a thin `PageBase` wrapper over `IPkNotifications`.

## 2. Core: defaults raised by the page types

One small helper in each lazy page-type chunk (not the entry graph; `record.js`, `list.js` and the others are loaded per route type). It calls `ctx.notify` (`null` without a notify service: then nothing is toasted and nothing throws) and respects the config below.

**Config on every page type that has outcomes (`record`, `list`):**

```js
config: {
  toasts: true,                       // default; false turns every default toast of this page off
  // or per outcome; a string is the title, false turns that one off, a function (detail, ctx) => string | false decides
  toasts: { saved: 'Order saved', failed: false, deleted: undefined, done: ... },
}
```

| Page type | Event | Default toast | Kind |
| --- | --- | --- | --- |
| `record` | `save` resolves (`pk-record-save`) | "Saved" (title), details the record heading when set | success |
| `record` | `save` rejects with a non-field error (the inline notice stays; field errors `{ errors }` get no toast, the fields say it) | "Could not save" with the error message as details | error (sticky) |
| `record` | a delete the page offers (an `actions` entry or `config.delete(id, ctx)`, new, optional) resolves / rejects | "Deleted" / "Could not delete" | success / error |
| `list` | `onBulk` promise resolves / rejects | "Done" with the count when the action says it, / "Could not complete" | success / error |

Rules: the toast is raised **after** the callback settles, never before; an app that already toasts itself keeps working because an identical kind and title raised again within 2 s is merged by `notify` (a different title is a second toast, so the migration note says: remove your own or set `toasts: false`); the title is plain text (no markup); a page that wants a different wording sets the string, a page that wants none sets `false`. `pk-toast-stack` stays the single host, owned by the notify service (it creates the stack when first needed and reuses the task manager's), so there is **no per-page host and no opt-in markup**.

**Opt-out levels:** `toasts: false` per page; `notify: null` in `mountApp` (no notify service at all, then no default toast anywhere); the Blazor side below mirrors both.

## 3. Accessibility

Nothing new to build: success and info are `role="status"` (polite, queued), warning and error `role="alert"` (assertive). Errors are sticky and dismissible so a reader can reach them; the inline notice of the record page remains (the toast is an addition, not a replacement), so the error is also in the page for keyboard users who dismissed the toast. Focus never moves to a toast. The 4 s default is paused on hover and focus by `pk-toast` itself.

## 4. App entry cap (`appEntryGzKb`, hard cap 22 KB, now 21.97)

Zero bytes in the entry graph: every change is inside the lazy page-type chunks (`record.js`, `list.js`, each budgeted at 3 KB gzip, currently under 1 KB) and `svc-notify` stays lazy. If a shared helper is wanted it goes in a new `js/app/pages/` chunk imported by both types (a lazy chunk, not the entry). No entry-graph file is touched, so no offsetting cut is needed; the existing test `core/tests/app-budgets.test.mjs` guards it.

## 5. Blazor: a thin base over the same stack

`PageBase` gains, over `IPkNotifications` (already registered by `AddPlainKit`):

```csharp
protected ValueTask ShowSuccess(string title, string? details = null);
protected ValueTask ShowWarning(string title, string? details = null);
protected ValueTask ShowError(string title, string? details = null);   // sticky, as the element's error kind
protected ValueTask ShowError(Exception exception, string? title = null); // logs, shows IPkUserFacingException messages as they are, a generic line otherwise
```

and the busy helper stays what it is (count and label only). `PageBase` takes the service through `[Inject]`, so a page that does not call these costs nothing and a test replaces `IPkNotifications` as it does today. A page that sets `protected virtual bool DefaultToasts => false;` opts out of the defaults below.

`PkRecordEditor<TRecord, TForm, TKey>` raises the same defaults when it is given a notifier (a new optional constructor argument or `Notify` property of type `IPkNotifications`): "Saved" after a save, "Deleted" after a delete, "Could not save/delete" (details: the user-facing message) after a failure, each overridable by a `Messages` record (`Saved`, `Deleted`, `Failed`; `null` means the default, empty string means none). Without a notifier it behaves exactly as now, so existing pages compile and render the same. `PkRecordForm` and the `PkDataTable`/`PkListPage` wrappers need no change: `PkListPage<TItem>`'s bulk callbacks go through the element's `list` page type only in the app framework; in Blazor the page calls `ShowSuccess` itself (documented in the skill).

## 6. What is breaking

- **JS app framework:** default toasts are **on** for `record` (saved, failed) and `list` bulk (done, failed). An app that raised its own "Saved" gets a second toast (a different title) or a merged one (the same title within 2 s). Migration: delete your own call or set `toasts: false`. Breaking changelog entry plus the `record` / `list` page-type docs and the SDK skill.
- **Blazor:** `PageBase` additions are additive; `PkRecordEditor` defaults are opt-in through the notifier argument, so no existing page changes. If the owner wants them on by default there too (the issue says "by default (overridable)"), the constructor takes a required notifier or the editor resolves it from DI: that is a breaking change for hand-constructed editors and must be confirmed.
- No change to `ctx.notify`, `IPkNotifications`, `pk-toast` or `pk-toast-stack`.

## 7. Delivery in steps (one PR each, browser or bUnit cases first)

1. **Core defaults.** A shared lazy helper `toastFor(config, ctx, outcome)`; `record` and `list` factories call it; browser cases in the app cases (record saved toast with the right kind and role, failure toast sticky, `toasts: false` and a string override, no notify service means no throw, duplicate title merged); docs (page-type meta text, the app-framework guide, the SDK skill) and a breaking fragment.
2. **Page-type delete and any further types** (`record` delete hook, `detail`/`master-detail` if they raise saved/deleted) with the same cases.
3. **Blazor:** `PageBase.ShowSuccess/ShowWarning/ShowError` with bUnit cases (a substitute `IPkNotifications`), `PkRecordEditor` defaults and `Messages`, the Blazor skill and reference text, `handwritten.baseline.json` budgets kept or lowered.
4. The `routed-pair` template drops its manual `ctx.notify.success('Saved')`, which proves the default.

## 8. Decisions needed from the owner

1. Defaults on in the JS framework: confirm "on by default, `toasts: false` to opt out", with the duplicate-title merge as the only softener.
2. Blazor `PkRecordEditor`: opt-in through a notifier (no break) or on by default (break for hand-built editors)?
3. Delete: should the `record` page type grow a `delete(id, ctx)` config key in step 2, or is delete only a Blazor/editor concern for now?
4. Wording: "Saved", "Deleted", "Could not save", "Done" as the neutral defaults (no noun), or take the page's `heading`/`noun` into the title ("Order saved")?
