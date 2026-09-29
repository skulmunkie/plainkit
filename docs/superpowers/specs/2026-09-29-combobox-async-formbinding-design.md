# Autocomplete / combobox primitive: fix pk-combobox, don't build a new element (issue #652)

Status: proposal for owner decision. Design only; no product code, no PR opened.

## Problem

Issue #652: `Backend.Web/Components/Shared/SkuPicker.razor` falls back to a raw `<input list>` + `<datalist>` because PlainKit's searchable-input
story has two real gaps, documented in that component's own header comment: a **clipping bug** when the suggestion panel sits inside a card, form
or table (`PlainKit/DataGrid clipping bug`), and no **`ValueExpression`/form-binding** support, so it cannot be wired into an `EditForm` the way
Blazor's own `InputText` can, and cannot compose into `PkFieldGroup`.

The issue is framed as "PlainKit has no searchable-input-with-suggestions component" and asks for a new `Pk*` autocomplete/combobox. That framing
is wrong in one important way, established by reading the code before designing anything (per `AGENTS.md`'s composition rule): **the component
already exists.**

## What already exists (evidence)

`core/elements/combobox/` (`pk-combobox`, exposed to Blazor as `PkCombobox`, `blazor/mappings/combobox.json`) is a form-associated ARIA 1.2
combobox that already covers the SKU-picker use case:

- `mode="autocomplete"` (default): type to filter; `mode="select"` is a separate custom-select mode, not relevant here.
- `filtering="off"` + the `pk-combo-query` event: the host gets the typed text and replaces the `<option>` children itself — exactly the
  "async search callback" shape #652 asks for. `filtering="client"` (default) also works locally without a host round-trip.
- `free`: keeps typed text that matches no option and uses it as the value — exactly "the SKU may not exist as a product yet."
- `formAssociated: true`, participates in `pk-form` validation (`required`, `invalid`), survives a form reset and bfcache restore
  (`onReset`/`onRestore`), same as `pk-input`.
- Full keyboard behavior already implemented and tested: arrows move, Enter picks, Escape closes, Tab closes, `aria-activedescendant` keeps
  focus on the input (`core/elements/combobox/combobox.js`, `core/elements/combobox/combobox.test.mjs`).
- A Blazor wrapper already exists and is generated today (`blazor/mappings/combobox.json` → `PkCombobox.razor`), with `Value`/`ValueChanged`,
  `OnSearchInput` (`pk-combo-query`), `Free`, `Filtering`, `Open`/`OnToggle`.

Building a second, parallel `pk-autocomplete`/`pk-combobox-async` element next to this would violate `core/STANDARDS.md`'s composition rule
("Reimplementation: an element already does this — use the element, a hand-rolled version is deleted, not kept alongside it") and would give the
SDK two components with near-identical ARIA combobox behavior to maintain (see "Rejected approaches" below for the one case where a second
element is still worth naming).

## What is actually broken

Two real, narrow gaps, both confirmed by reading the source, not inferred from the issue text:

### 1. The clipping bug is real, and it is exactly what `positioning.js` was built to fix elsewhere

`core/elements/combobox/combobox.css`:

```css
.pop { position: absolute; top: 100%; left: -1px; z-index: var(--z-modal-over-flyout); ... }
```

`pk-combobox`'s popup is positioned with plain CSS `position: absolute` inside the element's own shadow box. Any ancestor with
`overflow: hidden` or `overflow: auto` — a `pk-card`, a `pk-table` cell, a scrollable panel — clips it. `combobox.js`'s `updated()` flips
`data-placement` between `top`/`bottom` by measuring `getBoundingClientRect()`, but never escapes the containing block.

Compare `core/elements/dropdown/` and `core/elements/select-menu/` (both comment "the menu is a fixed layer placed by the positioning
helper") and `core/elements/badge-popover/`: all three `import { place, autoUpdate, onOutside } from '../../js/positioning.js'` and position
their floating layer with `position: fixed`, which `positioning.js`'s own header comment states plainly is the point — *"The layer is
position:fixed, so no overflow ancestor can clip it."* `pk-app-bar-search`'s popup (`app-bar-search.css`) is also plain `position: absolute`
and has the same latent bug, but it is normally used in a shell header, outside cards/tables, so it has not surfaced as a filed issue.

This is precisely the "PlainKit/DataGrid clipping bug" `SkuPicker.razor`'s comment names, already solved once in this codebase
(`dropdown`, `select-menu`, `badge-popover`) and simply not applied to `pk-combobox` when it was built. There is nothing to design here beyond
porting the existing pattern.

### 2. `ValueExpression`/`EditContext` binding does not exist anywhere in PlainKit.Blazor today

Confirmed by grepping the whole `blazor/` tree: no `ValueExpression`, no `[CascadingParameter] EditContext`, no `FieldIdentifier` anywhere.
Every generated `Pk*` component (`scripts/generate-blazor.mjs`) is a plain `[Parameter] Value` / `[Parameter] EventCallback<T> ValueChanged`
pair with no relationship to Blazor's own `EditForm`/`EditContext`/`InputBase<T>` machinery. `PkFieldGroup.razor` (`blazor/src/PlainKit.Blazor/
Components/PkFieldGroup.razor`) is hand-written and confirms the same gap at a higher level: it reads/writes a bound record through a
`Get`/`Set` spec pair and never touches `EditContext`. `Invalid` on a `Pk*` control is either set by the host by hand or by `pk-form`'s own
client-side validation (`aria-invalid`/`invalid` reflected from the DOM element), never by Blazor's built-in validation pipeline
(`DataAnnotationsValidator`, `EditContext.GetValidationMessages`).

This means `@bind-Value="model.Sku"` already works on `PkCombobox` today (plain two-way binding, generated by the `mapping.model` block), but
`<EditForm Model="model"><PkCombobox @bind-Value="model.Sku" />...` never lights up validation styling, never reports to
`DataAnnotationsValidator`, and there is no `ValueExpression`-typed parameter for a consumer to pass explicitly either. This is the gap #652
actually names.

## Goals

- Fix `pk-combobox`'s popup so it never clips inside a card, form section or `pk-table` cell, matching `dropdown`/`select-menu`/`badge-popover`.
- Give `Pk*` form controls an opt-in way to participate in a Blazor `EditContext`: `ValueExpression`, automatic `Invalid`/validation-message
  wiring, and `EditContext.NotifyFieldChanged` on commit — the same contract `InputText`/`InputSelect` already give Blazor authors, so
  `PkCombobox` (and, by the same mechanism, any other form control) drops into `EditForm` and `PkFieldGroup` without hand-wired validation.
- Do this as a generic, reusable mechanism in the generator/`PkElementBase`, not a one-off hack inside `PkCombobox` — this gap affects every
  `Pk*` form control (`PkInput`, `PkSelect`, `PkCheckbox`, `PkTextarea`), not only the new one.
- Keep `pk-combobox` a single component covering both "async, host-driven suggestions" and "type-to-filter local options" — no new element.

## Non-goals

- A new `pk-autocomplete`/`pk-combobox-async` element. Rejected; see below.
- Retrofitting `ValueExpression` support onto every existing `Pk*` form control in this PR series. The mechanism is generic, but the rollout
  is scoped to `PkCombobox` first (the component #652 is blocked on); extending it to `PkInput`, `PkSelect`, `PkCheckbox`, `PkTextarea` is a
  follow-up issue once the mechanism has shipped and been used for real.
- Refactoring `pk-app-bar-search` to share a base with `pk-combobox`. They are shaped similarly (text input + async results + keyboard nav)
  but serve different jobs (a shell-header search action vs. a form value); see "Rejected approaches."
- Changing `pk-combobox`'s `mode="select"` behavior, or its client-side `filtering="client"` matching algorithm.
- Loading/empty/error *states* beyond what already exists (`empty` slot, host clears `items`/options while a query is in flight or errored —
  same contract `pk-app-bar-search` already uses: the host owns fetch state, the element only shows what it's given). No new prop is needed for
  this; see "API surface" below for why a `loading` prop was considered and rejected.

## Design

### 1. Popup positioning fix (vanilla, `core/elements/combobox/`)

Port the same three-piece pattern `dropdown`/`select-menu` already use:

- `combobox.js`: `import { place, autoUpdate, onOutside, unplace } from '../../js/positioning.js';`. On `show()`, call
  `this.$stop = autoUpdate(this.ctl(), this.part('popup'), { placement: 'bottom-start', offset: 2 })` after making the popup visible (needs a
  layout pass first, same as `select-menu.js` does); on `hide()`, call `this.$stop?.()` and `unplace(this.part('popup'))`. Replace the
  hand-rolled `data-placement` flip in `updated()` (line computing `innerHeight - b.bottom < h ...`) with `place()`'s own flip/shift, which
  already accounts for the popup's real height and the viewport, and already handles right-to-left (`select-menu.js`/`dropdown.js` do the
  same swap; diffing against `select-menu.js`'s `show()`/`hide()` is the fastest way to write this correctly).
- `combobox.css`: `.pop { position: fixed; ... }` (drop `top`/`left` computed offsets, `positioning.js` sets `left`/`top` directly); keep
  `min-width`/`max-width`/`max-height`/`z-index` as is (`select-menu.css`'s `.pop` block is the template).
- Outside-close: `pk-combobox` already closes on `focusout`, which is stricter than `onOutside`'s pointerdown-based close (a mouse selection
  inside the popup does not blur the input first in every browser edge case `select-menu` had to handle) — check whether `select-menu.js`'s
  `onOutside` call is still needed on top of the existing `focusout` handler, or whether `focusout` alone remains correct once the popup is a
  sibling of the input in the fixed layer instead of a DOM-absolute child. This is exactly the kind of behavioral nuance `combobox.test.mjs`
  should pin down before the CSS changes, per TDD.
- No prop/event/part changes. This is a pure bug fix: `combobox.meta.json` is unchanged.

New coverage (verification-before-completion, per `AGENTS.md`):
- `core/elements/combobox/combobox.test.mjs`: an assertion that the popup is `position: fixed` while open (or a `positioning.js` spy showing
  `place`/`autoUpdate` were called), since the current tests only check DOM state, not layout.
- A **scenario** (`core/tests/review/scenarios/combobox-in-card.js`, per `AGENTS.md`'s "Scenarios for states a still example cannot show"):
  a `pk-combobox` inside a `pk-card` with `overflow: hidden` (or a `pk-table` cell), the popup opened, `t.noOverlap`/a custom check that the
  popup's bounding rect is NOT clipped by the card's rect. This is the regression test for the exact bug #652 describes; a gallery example alone
  (a resting combobox) cannot show it.
- `node scripts/ui-review.mjs --elements combobox` screenshots before merge (a CSS/layout change per `AGENTS.md`'s "Reviewing what it looks
  like" section), including the new scenario's shots.

### 2. `ValueExpression`/`EditContext` binding (Blazor, generic mechanism, piloted on `PkCombobox`)

Mirror Blazor's own `InputBase<T>` contract (`Microsoft.AspNetCore.Components.Forms`) rather than inventing a new one, since that is the
shape every Blazor author already knows and the shape `DataAnnotationsValidator`/`ValidationMessage`/`EditForm` are built to consume.

**Mechanism**, added to `PkElementBase` (or a new `PkFormElementBase : PkElementBase` used only by form-participating components, to avoid
adding `EditContext` plumbing to every element, including non-form ones like `PkDock`):

```csharp
public abstract class PkFormElementBase<TValue> : PkElementBase
{
    [CascadingParameter] private EditContext? CascadedEditContext { get; set; }

    /// <summary>An expression identifying the bound model property (as Blazor's own InputBase requires), e.g.
    /// <c>ValueExpression="() => model.Sku"</c>. Optional: omit it to use the component outside an EditForm exactly as today.</summary>
    [Parameter] public Expression<Func<TValue>>? ValueExpression { get; set; }

    private FieldIdentifier? _field;
    protected FieldIdentifier? Field => _field ??= ValueExpression is null ? null : FieldIdentifier.Create(ValueExpression);

    protected override void OnParametersSet()
    {
        if (CascadedEditContext is not null && Field is { } f && !Invalid.HasValue /* host didn't set it explicitly */)
            Invalid = CascadedEditContext.GetValidationMessages(f).Any();
    }

    protected async Task NotifyCommitted()
    {
        if (CascadedEditContext is not null && Field is { } f) CascadedEditContext.NotifyFieldChanged(f);
    }
}
```

(Sketch, not final C#; the point is the shape: cascading `EditContext`, `ValueExpression` for `FieldIdentifier`, `Invalid` driven from
`GetValidationMessages` unless the host set it explicitly, `NotifyFieldChanged` called from the same place the generator already emits the
`ValueChanged`/`{Prop}Changed` invocation.)

**Generator change** (`scripts/generate-blazor.mjs`): a new mapping flag on the `model` block, `"formBindable": true`
(`blazor/mappings/combobox.json` only, for the pilot):

```json
"model": { "prop": "value", "event": "pk-combo-select", "key": "value", "formBindable": true }
```

When set, `modelElement()` makes the generated component inherit `PkFormElementBase<string>` instead of `PkElementBase`, adds the
`ValueExpression` parameter (already declared by the base class, so no per-component boilerplate needed beyond the base class swap), and in
`renderComponent()`'s handler body (the `h.updates`/`h.callbacks` loop that already runs on every commit) adds one line,
`await NotifyCommitted();`, alongside the existing `await {Prop}Changed.InvokeAsync(...)`. This is a small, mechanical change to
`renderComponent`/`modelElement` (roughly the size of the existing `addBind` logic), not a rewrite of the generator.

**Why generic, not `PkCombobox`-only:** the exact same gap exists on `PkInput`, `PkSelect`, `PkCheckbox`, `PkTextarea` today (confirmed: none
of them has `ValueExpression` either). Hard-coding `EditContext` logic inside one generated `.razor` file (which `scripts/generate-blazor.mjs
--check` would then flag as drifted from the mapping-driven template) would violate the same "don't hand-roll a special case" instinct the
composition rule states for vanilla elements. Building it once in `PkFormElementBase` and turning it on per-mapping with one flag is the
same cost, reusable immediately by the next component.

**`PkFieldGroup` is explicitly out of scope for this change.** It does not use `EditForm`/`EditContext` at all (confirmed above); wiring it in
is a second, separable piece of work (its own `Get`/`Set` spec model would need to synthesize a `ValueExpression`, e.g.
`() => f.Get(Model)`, which is possible but changes `PkFieldSpec<TItem>`'s contract) and is not required to unblock `SkuPicker.razor`, which
does not use `PkFieldGroup`. Filed as a follow-up note under "Open questions," not built here.

## API surface

No new public element. `pk-combobox`'s existing surface (`combobox.meta.json`) is **unchanged** by the CSS/positioning fix. The only additions
are on the Blazor side:

| Addition | Where | Type | Notes |
| --- | --- | --- | --- |
| `ValueExpression` | `PkFormElementBase<TValue>` (new base class), inherited by `PkCombobox` | `Expression<Func<TValue>>?` | Optional. Omitted: component behaves exactly as today (plain `@bind-Value`, no `EditContext` interaction). |
| (mechanism) `Invalid` auto-set from `EditContext.GetValidationMessages` | `PkFormElementBase<TValue>` | — | Only when the host has not set `Invalid` itself and an `EditContext` is cascaded; explicit `Invalid="..."` from the host always wins. |
| (mechanism) `EditContext.NotifyFieldChanged` on commit | generated handler body | — | Fires in addition to, not instead of, the existing `ValueChanged`/`{Prop}Changed` callbacks. |
| `"formBindable": true` | `blazor/mappings/combobox.json` `model` block | mapping-only flag | Not a runtime API; documented in `blazor/mappings/README` or wherever the mapping format is documented, for the next component that adopts it. |

Considered and rejected for this API surface:
- **A `loading` prop on `pk-combobox`.** The host already owns fetch/loading state under the existing `pk-combo-query` contract (same as
  `pk-app-bar-search`'s `pk-query`/`items`): while a request is in flight the host can leave the previous options in place, clear them, or
  swap in a `<option disabled>` "Searching…" row — all expressible today with the `filtering="off"` + option-children contract, no new prop
  needed. Adding `loading` would duplicate state the host already has and create a second source of truth for "what to show right now."
- **An `error` slot/prop for async search failures.** Same reasoning: the host can render an `empty` slot message ("Search failed — try
  again") or an `<option disabled>` row; `pk-app-bar-search`'s `empty` slot is the existing precedent for exactly this.

## Blazor `ValueExpression` mechanism: summary

`PkCombobox` gains an optional `ValueExpression` parameter and a cascading `EditContext` dependency, following the same
`FieldIdentifier`/`NotifyFieldChanged`/`GetValidationMessages` contract Blazor's built-in `InputBase<T>` uses. Because no `Pk*` component uses
`InputBase<T>` as a base class today (they are all custom-element wrappers, not `<input>` wrappers, so `InputBase<T>`'s DOM assumptions do not
apply), the mechanism is reimplemented at the right level: a new `PkFormElementBase<TValue>` that generated form-control components inherit,
turned on per-component with a `"formBindable": true` mapping flag. `PkCombobox` is the pilot; the same flag unblocks `PkInput`/`PkSelect`/
`PkCheckbox`/`PkTextarea` later with no new mechanism, only mapping edits.

## Gzip budget

`core/dist/elements/combobox.js` measures **3.998 KB gzip today** against `elementGzKb`'s blanket limit of 4.5 KB (target 2 KB;
`core/site/scorecard/scoring.data.js`). That leaves very little headroom.

The positioning fix adds one `import` from the already-shared `core/js/positioning.js` (a separate module under `jsModuleGzKb`, target 3 KB /
limit 6 KB, not counted against `combobox.js`'s own budget — the same accounting `dropdown.js`/`select-menu.js` already benefit from) plus a
handful of call sites (`place`/`autoUpdate`/`onOutside`/`unplace` calls replacing the current hand-rolled `data-placement` arithmetic, which is
removed). Net change to `combobox.js` itself should be small and could plausibly be a **wash or a slight reduction** (the removed inline
placement math roughly offsets the new import statements and calls), but it is not free, and the 4.5 KB limit is a hard ratchet
("Size budgets are never raised. Not the page layer's 10 KB gzip, not an element's. If you are over, make the source smaller" — `AGENTS.md`).

**Risk, flagged explicitly:** if the swap pushes `combobox.js` over 4.5 KB gzip, the fix must not get an `elementGzKbOverrides` entry without
owner sign-off (`AGENTS.md`'s rule for that table) — the implementer trims elsewhere in the file first (candidates: the hand-rolled typeahead
buffer logic, which is already minimal, or sharing more of the `nextIndex`/`typeaheadIndex` helpers with `dropdown`/`select-menu` if they
duplicate logic — a real measurement is needed before deciding where to cut). This must be measured with `node scripts/bootstrap.mjs` +
the scorecard check as the very first step of implementation, not discovered at the end.

The Blazor `ValueExpression` mechanism has no gzip-budget implication (server/compile-time C#, not shipped to the browser bundle it measures).

## PR split

Two independent PRs, same split pattern as issue #644 (vanilla first, Blazor wrapper second), each leaving `main` releasable:

1. **`agent/652-combobox-popup-positioning`**: the CSS/JS positioning fix in `core/elements/combobox/` (section 1), the new test assertion,
   the new scenario (`combobox-in-card.js`), `ui-review.mjs` screenshots, a `fixed` changelog fragment. No Blazor changes (the generated
   `PkCombobox.razor` is unaffected by a CSS/positioning-only change — verify with `node scripts/generate-blazor.mjs --check`). This alone
   already lets `SkuPicker.razor` drop its `<datalist>` fallback for the clipping reason.
2. **`agent/652-blazor-value-expression`** (depends on 1 landing, or can be built against 1's branch and rebased): `PkFormElementBase<TValue>`,
   the `formBindable` generator flag, `combobox.json` mapping update, `PkGeneratedEnums.cs`/`PkGeneratedEvents.cs` regenerated, Blazor tests
   (`blazor/tests/PlainKit.Blazor.Tests/`) covering: `ValueExpression` omitted (unchanged behavior), `ValueExpression` set inside an
   `EditForm` with `DataAnnotationsValidator` (an invalid field gets `Invalid=true` and clears it once corrected), host-set `Invalid` still
   wins over `EditContext`. Docs: the SDK's Blazor guide gains a "form validation" example using `PkCombobox` inside `EditForm`. A `changed`
   changelog fragment.

Each is small enough to stay near the ~400-line guideline on its own; combined they would not be (a CSS/positioning change reviewed by
screenshot and a C# generator change reviewed by code both want their own focused review pass).

## Rejected approaches

**A. New element `pk-autocomplete`/`pk-combobox-async`, replacing or sitting beside `pk-combobox`.** Rejected: `pk-combobox` already has
100% of the behavior #652 asks for (async search via `pk-combo-query` + `filtering="off"`, free text via `free`, full ARIA combobox keyboard
model, form association). Building a second element would be exactly the "hand-rolled version kept alongside it" `core/STANDARDS.md` forbids,
doubles the maintenance surface (two sets of keyboard-nav/positioning/ARIA bugs to fix in parallel — the clipping bug above would need fixing
twice), and gives Blazor consumers two similar-but-different components to choose between with no clear rule for which to reach for. The
`SkuPicker.razor` comment describes gaps in `pk-combobox`, not a missing capability class.

**B. Extract a shared base between `pk-combobox` and `pk-app-bar-search`.** Considered because the two elements are shaped similarly (text
input, async/local results, `nextIndex`-driven keyboard nav, `data-placement` popup). Rejected for this issue: they solve different problems —
`pk-app-bar-search` is a navigation/shell-search action (raises `pk-select`, the host decides where to go, has its own expand/collapse-to-icon
phone behavior, item `group`/`thumbnail`/`badge` shape) with no form value or `ValueExpression` concern at all, while `pk-combobox` is a form
control (`formAssociated`, participates in `pk-form`/`EditContext` validation, has a `value`). Forcing a shared base now, to fix a positioning
bug that has a five-line precedent already committed three times (`dropdown`, `select-menu`, `badge-popover`), is a bigger, riskier change for
no behavioral gain; the two elements already share the *pattern* (read `positioning.js`, copy the calls) without sharing *code*, which is
consistent with how `dropdown`/`select-menu`/`badge-popover` already relate to each other — no shared base among those three either. If a
fourth or fifth element needs the same shell (this is genuinely the third time `nextIndex`/keyboard-list navigation has been hand-copied,
after `dropdown` and `select-menu`), that is worth a promotion issue for a `core/js/list-nav.js` helper — but that is a `core/js/*` utility
promotion, not a `pk-*` element merge, and is not blocking here.

**C. Naming.** `pk-combobox` does not collide with `pk-dropdown` (a menu of actions/links, not a form value), `pk-select` (native
`<select>` wrapper, no free text or async search), or `pk-select-menu` (`pk-select`'s internals, a fixed-positioned listbox — itself already
proof positioning.js is the right tool here). No new tag name is needed since no new element is being added.

## Open questions for the owner

1. **`PkFieldGroup` + `ValueExpression`.** Out of scope here (see "Non-goals"), but `SkuPicker.razor`-shaped forms often do go through
   `PkFieldGroup` once they're not one-off pickers. Worth a follow-up issue once the base mechanism has shipped: `PkFieldSpec<TItem>` would
   need to synthesize a `ValueExpression` from its `Get` (or accept one explicitly per field), which changes a public generic contract used by
   every existing `PkFieldGroup` caller — a bigger, separate design pass, not a rider on this one.
2. **Rollout order of `formBindable` to the other form controls** (`PkInput`, `PkSelect`, `PkCheckbox`, `PkTextarea`). This spec pilots the
   mechanism on `PkCombobox` only, because that is what unblocks #652. Recommend a follow-up issue, filed after this ships, to flip the flag
   on the rest one mapping at a time (each is a one-line mapping change plus tests, not new mechanism) rather than doing it here and growing
   this PR series past its stated scope.
3. **The `nextIndex`/typeahead duplication** between `pk-combobox`, `pk-dropdown`/`select-menu`, and `pk-app-bar-search` (each has its own
   copy of essentially the same list-navigation arithmetic) is a candidate for a `core/js/*` promotion per `core/STANDARDS.md`'s "used more
   than once" rule. Not required for #652; noting it here since it surfaced during this investigation rather than filing a drive-by fix.
4. **Gzip headroom.** If the positioning fix does not net out to roughly the same size (see "Gzip budget"), the owner needs to decide between
   trimming `combobox.js` further and a documented, sign-off exception — flagging this now so it isn't a surprise mid-implementation.
