# pk-field-group and pk-record-form: pk-form aware of form-associated groups (2026-10-08)

Design only; nothing in source changes with this document. Written against `origin/next` after #961. Issues it serves: #222 (schema-driven field groups, shipped as `core/modules/field-group` and the Blazor `PkFieldGroup<TItem>`), #226 (conditional fields, hidden required fields), #801 section 2.3 (the two Blazor files whose logic belongs in core: `PkFieldGroup.razor` and `PkRecordForm.razor`, both `debt` in `blazor/handwritten.json`).

Owner decision applied: **`pk-field-group` is a form-associated element** (ElementInternals), and `pk-form` learns to work with it.

---

## 1. What exists today

| Piece | Where | Behaviour that matters here |
|---|---|---|
| `mountFieldGroup(container, { fields, data, onChange })` | `core/modules/field-group/field-group.js` (92 lines) | Builds `pk-field` + `pk-input`/`pk-select`/`pk-textarea`/`pk-checkbox` **in the container's own light DOM**, because pk-form finds controls through `form.elements` and matches live events by tag. `when(data)` removes a hidden field from the DOM (that is the #226 rule: a removed element is not in constraint validation). Re-evaluates every `when` after every commit. |
| `PkFieldGroup<TItem>` | `blazor/.../Components/PkFieldGroup.razor` (134 lines, budget in `handwritten.baseline.json`) | A `@foreach` over `PkFieldSpec<TItem>` rendering the same kind-to-control table in Razor; `Get`/`Set` funcs, `When`, `Disabled`, `ReadOnly`, `HelpWhen`, `LabelAction` (a `RenderFragment`), `Search` (async), `OptionsSource`. Baseline debt: `layout-recipe` ("kind-to-control table and visibility rule that js/page-fields.js already has; moves to a pk-field-group element"). |
| `js/page-fields.js` | core | A third copy of the kind-to-control table for tool-page and settings-page. |
| `pk-form` | `core/elements/form/form.js` (84 lines) | Validates `form.elements.filter(checkable)`, shows each message in the enclosing `pk-field`, lists problems in a summary, focuses `invalid[0]`, emits `pk-invalid { count, controls, messages }`. Live checks (blur, input) only for an `e.target.closest(<list of control tags>)`. |
| `PkRecordForm` | `blazor/.../Components/PkRecordForm.razor` (137 lines) | `PkForm Summary` around the caller's own `<form>`, holding a `PkStack`: toolbar (Cancel, Actions, Delete, Save), Tabs, error alert, body, optional `PkDetailLayout` sidebar. Baseline debt: `layout-recipe` and `name-parity` ("old name of PkRecordPage"). |
| `pk-record-page` | `core/pages/record-page` | A **config-driven** page type (load/save callbacks, view and edit modes, `fields` array). It builds its own `pk-form` inside its shadow tree. Not a layout around the consumer's own form. |

Two facts about the platform decide most of the design:

1. **A form owner never crosses a shadow boundary.** A form-associated control inside a shadow root is associated with a `<form>` only if that form is an ancestor *in the same shadow tree*. So `pk-input`s rendered in a `pk-field-group`'s shadow root are not in the outer form's `form.elements`, not in its `FormData`, and are not reset or validated by it. That is exactly why the module renders into light DOM.
2. **A form-associated custom element is in `form.elements`, contributes to `FormData`, and takes part in `form.checkValidity()`/`requestSubmit()`** through `ElementInternals`: `setFormValue(FormData)` may carry any number of named entries, and `setValidity(flags, message, anchor)` accepts an anchor that is a shadow-including descendant of the element (the platform then focuses and scrolls to the anchor on a failed submit; `pk-input` already does this, `input.js` line 66).

So the owner's design works: the group is one form-associated element in the form, and its shadow tree holds the controls. What it costs is that `pk-form` must look *through* the group.

---

## 2. The element: `pk-field-group`

**Tier `component`** (it renders `pk-field` and the controls; a `tier: element` renders no `pk-*`). Folder `core/components/field-group/`, group "Form layout". Shared kind table moves to `core/js/field-kinds.js` and is also read by `js/page-fields.js` (removes the third copy).

### 2.1 API

| Prop | Type | Default | Notes |
|---|---|---|---|
| `fields` | json | `[]` | The specs (below). Data only. |
| `values` | json | `{}` | `{ key: value }`. A string, boolean (checkbox, switch), number or `string[]` (multi select, tag input). The element keeps its own copy and **writes it on a user commit** (the same contract as `pk-input.value`: the host sets it, the user's edits update it). |
| `name` | string | `""` | Form field name of the group; entries are submitted under each field's own `key`, so `name` only prefixes when `prefix` is on. |
| `prefix` | boolean | `false` | Submit `name.key` instead of `key` (a form with two groups of the same keys). |
| `disabled` | boolean | `false` | Disables every control; also set by `<fieldset disabled>` through `formDisabledCallback`. |
| `readonly` | boolean | `false` | |
| `label` | string | `""` | The group's accessible name (`role="group"`). |
| `columns` | number | `1` | Optional grid; `span` on a spec widens one field (the Blazor `Span`). |

Field spec (`fields[i]`), every key optional except `key` and `label`:

```
{ key, label, kind: 'text'|'number'|'email'|'password'|'date'|'time'|'url'|'tel'|'textarea'|'select'|'checkbox'|'switch'|'range'|'combobox',
  hint, help, required, readonly, disabled, hideLabel, span,
  placeholder, min, max, step, minlength, maxlength, pattern, rows,
  options: [{ value, label }], free,                 // select / combobox
  when: { field, equals | in | not }                 // declarative visibility (2.4)
  msg: { required: '...', pattern: '...' } }         // becomes the control's data-msg-<constraint>
```

Callback properties (never JSON, per STANDARDS "business logic"): `visible(spec, values) -> boolean` (a full predicate when the declarative `when` is not enough) and `search(key, query) -> Promise<option[]>` (combobox async options). Both optional.

Slots: `label-action-<key>` per field (replaces the Blazor `LabelAction` render fragment); `footer`.

Events (bubble, composed, `pk-` prefix): `pk-change { key, value, values }` on every committed change (the control's own documented commit, not raw `input`); `pk-field-search { key, query }` is not needed when the `search` callback is set (the callback form is the one specified; the event form is the Blazor path, see 6.2).

Methods: `problems()`, `report(show = true)`, `checkField(key)`, `focusField(key)`, `refresh()`.

Parts: `group` (the grid), `field-<key>` is **not** a part (parts are static); consumers style fields only through tokens (`--pk-field-group-gap`, `--pk-field-group-columns`).

### 2.2 Form association

```
static formAssociated = true
```

- **Value.** After every change the element builds `new FormData()` and calls `setFormValue(fd)`: one entry per visible, enabled, non-checkbox-unchecked field, under `key` (or `name.key`); a multi value appends one entry per item (the same convention as `pk-select multiple` and `pk-tag-input`). A hidden field contributes **nothing** (it stays in `values` so a model keeps it, but it is not submitted). The `FormData` constructor path is the only multi-entry form value the platform has; no JSON blob and no string joining.
- **Validity.** Each inner control already validates itself (it is a form-associated element in the group's shadow tree). The group aggregates: if any visible control is invalid it calls `setValidity({ customError: true }, firstMessage, anchor)` with `anchor` = that control's own focusable (so the platform focus-on-failed-submit lands on the right input), otherwise `setValidity({})`. The first invalid control's message is `validationMessage`; `validity.customError` is what `pk-form`'s `messageFor` already maps to the `custom` constraint, so an app with no pk-form still gets a sensible `form.reportValidity()`.
- **Reset and restore.** `formResetCallback` restores `values` to the snapshot taken at the last `values` assignment from the host (or the first connect) and redraws; `formStateRestoreCallback` restores a saved `FormData` (autofill/back navigation) by key; `formDisabledCallback` sets `disabled`.
- **No double submission.** The inner controls are in a shadow tree with no form owner, so they submit nothing themselves; only the group's `FormData` does.

### 2.3 What pk-form does today with such a group, and what must change

Findings from reading `form.js`:

| `pk-form` step | With a group in the form today | Required change |
|---|---|---|
| `controls()` = `form.elements` filtered by `checkable` | The group **is** in `form.elements` (form-associated). `checkable` reads `c.internals.willValidate`: true. | None. |
| `check(control)` → `messageFor(control)` reads `validity` flags | Works on the aggregate: first message only, `customError`. | Keep as the fallback for any form-associated element. |
| `show(control, message)` → `control.closest('pk-field')`, else `control.invalid = ...`, else `aria-invalid` | Group has no enclosing pk-field; `'invalid' in group` is false; it would set `aria-invalid` on the group host and show **nothing in the fields**. | New protocol (below): ask the group to show its own field errors. |
| `live(e, kind)` | `e.target` is the **group** (events are retargeted at the shadow boundary); not in the tag list, so no live checking at all. | Resolve the real control with `e.composedPath()[0]` and, when it lives inside a group, call the group's `checkField(key)`. |
| `submit(e)` → `invalid[0].focus()` | `group.focus()` focuses the first focusable, not the first invalid field. | Group overrides `focus()` to focus the first invalid control, else the first control. |
| `summarise(invalid)` | One summary line per **control**: the group gives one line (`nameFor` → no label). With three invalid fields inside, the user sees one. | Expand a group into its problems (below). |
| `pk-invalid { count, controls, messages }` | `controls` would list the group. | `controls` lists the group once; `messages` lists every problem (an additive field `problems: [{ key, label, message }]`). |

**The protocol (small, duck-typed, no new base-class hook):** a form-associated element that contains controls of its own implements three methods and `pk-form` calls them when present:

```
problems()  -> [{ key, label, message, focus() }]   // every invalid visible field, in order
report(on)  -> void                                  // on: show each invalid field's message in its pk-field; off: clear them all
checkField(controlOrKey) -> boolean                  // re-check one field (live validation), showing or clearing its message
```

`pk-form` changes (about 40 lines, in `form.js`):

1. `controls()` stays; a new `expand(c)` returns `c.problems?.() ?? [{ control: c, ... }]`.
2. `check(c)`: if `c.report` exists, `c.report(true)` then `return c.problems().length === 0`; else the current path.
3. `submit`: flatten problems; focus `problems[0].focus?.() ?? control.focus()`; summary items come from the flattened list and their links call each problem's own `focus()`.
4. `live`: `const t = e.composedPath()[0]`, find the group with `t.getRootNode().host?.checkField`; apply `shouldCheck(this.validate, kind, showing)` where `showing` asks the group's field.
5. `reset`: `c.report?.(false)` for groups.

Nothing in `pk-form` learns about `pk-field-group` by name; any element that implements the three methods (a future `pk-address-field`) works the same.

### 2.4 Conditional fields and hidden required (#226)

- `when: { field: 'status', equals: 'closed' }` (also `in: [...]`, `not: x`) is data, so it survives JSON, Blazor and the skills; `visible(spec, values)` is the escape hatch for anything else.
- A field that is not visible is **not in the shadow DOM at all** (removed, not `hidden`), so its control is not in the group's validity and a hidden `required` can never block a submit: the same rule the module and the Blazor group implement, now in one place.
- Every `when` is re-evaluated after **every** commit and on `refresh()` (one field's value can gate another's), O(fields) per commit.
- A field that turns hidden keeps its value in `values` (the model keeps it); it is not in the `FormData`. A field that turns visible again is rebuilt from `values`. Documented, and a browser case covers both.

### 2.5 Accessibility

- The host has `role="group"` and `aria-label` from `label` (`internals.role`/`ariaLabel`, the SDK's `aria()` helper).
- **`aria-describedby` and `for` never cross a shadow root, and none needs to**: every `pk-field` and its control are in the group's *one* shadow root, and `pk-field` already hands label, help and error to the control as properties (`field.js`: `label`, `description`, `invalid`), not ids. A `pk-field` per spec means a visible label, the hint under it and the error in its own live region.
- Error summary: each summary item names the field (`Quantity: Please fill out this field.`) and activating it (click, Enter) calls that problem's `focus()`, which moves focus *inside* the group's shadow tree to the control. This is the one place where plain `a href="#id"` links cannot work (an id in a shadow root is not addressable from the light DOM), which is why summary items already use `role="link"` and a handler.
- First-error focus: `pk-form` calls the first problem's `focus()`; the platform's own `setValidity` anchor does the same for `form.reportValidity()` outside pk-form.
- Disabled/readonly propagate to the controls with the same attribute the control already understands (no `aria-disabled` shim).
- `hideLabel` keeps the label as the control's accessible name (`aria-label`), as the Blazor code does today.

### 2.6 Tokens and styling

Tokens only: `--pk-field-group-gap` (default `--space-4`), `--pk-field-group-columns`, `span` via the existing grid. No literal size, no class strings in the module.

### 2.7 What the existing module becomes

`mountFieldGroup(container, { fields, data, onChange })` becomes a thin wrapper: it creates one `pk-field-group`, sets `fields`/`values`, maps `onChange` to `pk-change`, and `refresh(data)` to setting `values`. Its callers keep working; the module's logic (kind table, `when`, rebuild) leaves. The module's own light-DOM trick is no longer needed because pk-form now looks through the group.

---

## 3. `pk-record-form`

### 3.1 The decision to make

The baseline says `PkRecordForm` is the "old name of PkRecordPage; renamed once pk-record-page has slots for actions, sidebar and tabs (#801 name map)". Reading `pk-record-page` against `PkRecordForm` shows they are different things:

| | `pk-record-page` | `PkRecordForm` today |
|---|---|---|
| Owns | load, save, dirty, view and edit modes, the fields list, the form it builds | nothing: the caller's own `<form>`, state and save |
| Form | built inside its shadow tree from `config.fields` | the caller's native form, with the caller's controls |
| Layout | header + detail layout + bar | toolbar + tabs + alert + body + optional detail layout |

Adding "slotted form mode" to `pk-record-page` would put two unrelated contracts (config-driven and slotted) on one element, with a mode matrix. **Recommendation: a new, lean `pk-record-form` element** (tier `component`) that is exactly the Razor recipe, and leave `pk-record-page` as the config-driven page type. The Blazor `PkRecordForm` then has an element of the same name and becomes generated; the `name-parity` and `layout-recipe` debt entries are deleted (the "rename to PkRecordPage" plan in the baseline reason is superseded; this needs the owner's nod because that reason cites the #801 name map).

### 3.2 API

Layout only around the consumer's own form: it owns no values, no load and no save.

| | |
|---|---|
| Slots | default (the caller's `<form>`; the main column lives inside it), `sidebar`, `actions` (extra toolbar buttons), `tabs`, `header-actions` (when `actions-in-header`) |
| Props | `saveLabel` ("Save"), `deleteLabel`, `busyText` ("Saving…"), `saveDisabled`, `busy`, `error` (string, an alert above the body), `cancellable`, `deletable` (show the Cancel and Delete buttons), `actionsInHeader` |
| Events | `pk-record-save` (after `pk-form` validates), `pk-record-cancel`, `pk-record-delete`. (`pk-valid` from the inner `pk-form` is re-emitted as `pk-record-save`.) |
| Methods | `submit()` (what a header-placed Save button calls; replaces the `form="id"` trick, which cannot resolve across a shadow root) |
| Parts | `toolbar`, `error`, `body`, `side` |

How it works without breaking pk-form: the shadow template is `pk-form summary` wrapping the layout and a `<slot>`; `pk-form` finds the form with `slotted()` using `assignedElements({ flatten: true })`, which flattens a slot nested in a slot, so the caller's light-DOM `<form>` is found. The caller's controls are in the **light tree under their own `<form>`**, so form ownership, `form.elements`, `FormData` and `pk-field-group` (which is form-associated, 2.2) all work with no change. The toolbar buttons are in the shadow tree, outside the form, so Save calls `form.requestSubmit()` (the same technique `pk-record-page` already uses) and `pk-button type=submit` association by id is not needed.

Tier check (composition rules): uses `pk-form` (element), `pk-detail-layout` (component), `pk-button`, `pk-alert`, `pk-cluster`, `pk-stack` — nothing above `component`.

---

## 4. Blazor outcome

Rules in force (`blazor/handwritten.json`, `scripts/tests/blazor-wrapper.test.mjs`): a hand-written file needs a category, budgets only shrink, component names are `Pk` + tag.

### 4.1 `PkFieldGroup` becomes generated

`blazor/mappings/field-group.json` (props `fields` json, `values` json, `name`, `prefix`, `disabled`, `readonly`, `label`, `columns`; event `pk-change`; slots by name). The generator gives `PkFieldGroup` with `Fields` (`IReadOnlyList<PkFieldDef>`, a plain record serialised to JSON), `Values` (`Dictionary<string, object?>`), `ValuesChanged`, `OnChange`. The 134-line Razor file and its `layout-recipe` baseline debt are deleted.

What the typed API loses, and where it goes:

| Today (`PkFieldSpec<TItem>`) | After |
|---|---|
| `Get`/`Set` funcs on a model | A small **typed adapter** `PkFieldBinding<TItem>` (category `typed-generics`, like `PkLookupPicker`, budget about 60 lines): turns `Model` + specs into `Values` and applies `pk-change` back through `Set`, then raises `ModelChanged`. `Fields="@specs" Model="@m" ModelChanged="..."` keeps working on the generic component `PkFieldGroup<TItem>` (a distinct generic type, coexisting with the generated `PkFieldGroup`). |
| `When: Func<TItem,bool>`, `Disabled`, `ReadOnly`, `HelpWhen` | Evaluated by the adapter on every render and serialised into the field def (`when` result as `visible`, `disabled`, `help`); the element stays declarative. |
| `LabelAction: RenderFragment` | Slot `label-action-<key>` (a `ChildContent` per key is not expressible in the generated API; the adapter forwards it through a named slot). |
| `Search` async | `search` is a callback property on the element; Blazor wires it through the existing JS-interop callback path used for `PkTable` loaders, or the `pk-field-search` event form with `SetOptions(key, options)`. Needs a decision (6.2). |
| `OptionsSource: Func<...>` | Evaluated by the adapter into `options`. |

This is a **breaking** change only for code that used `PkFieldGroup` *non-generically*; `PkFieldGroup<TItem>` keeps its parameters. Changelog entry type `breaking` with the migration, plus the skills' Blazor workflow.

### 4.2 `PkRecordForm` becomes generated

`blazor/mappings/record-form.json`: the props and slots of 3.2; `OnValid` renames to `OnSave` only if the owner wants name parity with the event (otherwise map `pk-record-save` to `OnValid` as the mapping's `event` alias; the mapping format already supports an explicit callback name). The 137-line Razor file, its `layout-recipe` and `name-parity` debt, and the `form="id"` workaround comment are deleted. `PkRecordEditor` (state half) is untouched.

### 4.3 Baseline effect

`handwritten.json`: `PkFieldGroup.razor` and `PkRecordForm.razor` removed (and `PkFieldGroupTypes.cs` shrinks to the typed adapter's records). `handwritten.baseline.json`: three debt entries deleted, two file budgets deleted, one new small budget for the adapter. Net: about 270 hand-written lines out, about 60 in.

---

## 5. Test plan

Node (`*.test.mjs`, logic only): the field-kinds table (kind to tag and attributes), the `when` evaluator (`equals`, `in`, `not`, missing field), the `FormData` builder (multi value, checkbox, hidden excluded, prefix), the aggregate validity reducer (first message, anchor choice), the problems list order.

Browser cases (`core/tests/browser/cases-forms.js`), written **before** each step's code:

1. A `pk-field-group` in a `<form>`: `new FormData(form)` has one entry per visible field, a multi value has one entry per item, a hidden field none; the group is in `form.elements`.
2. `form.checkValidity()` is false with a required empty field and true after typing; `form.reportValidity()` focuses that field (the platform anchor).
3. `pk-form summary`: three invalid fields give three summary lines, each link moves focus to its own control inside the shadow tree; the first invalid field gets focus on submit; `pk-invalid.problems` lists all three.
4. Live validation: blur and input re-check one field (mode `blur`, `input`, `submit`), a field already showing an error re-checks as you type, and only that field changes.
5. `when`: a hidden required field does not block submit; showing it again blocks; its value is kept in `values` while hidden and absent from the `FormData`.
6. Reset (`form.reset()`) restores `values` and clears messages; `formStateRestoreCallback` restores by key.
7. Group inside a `pk-record-form` and inside a `pk-record-page`-style form in a shadow tree: association still holds.
8. `pk-record-form`: Save with a bad field shows the summary and does not emit `pk-record-save`; Save with good data emits it once; `submit()` from outside does the same; Cancel and Delete emit once; `busy` disables Delete and shows `busyText`.
9. The existing `mountFieldGroup` browser case runs unchanged against the wrapper.

Scenarios (`core/tests/review/scenarios/`): `field-group` (all kinds, a hidden-then-shown field, the summary with three errors, desktop and phone, light and dark, RTL) and `record-form` (toolbar, tabs, alert, sidebar, the header-actions variant). Every shot is read; an expectation measures that the summary links and the first error are in the viewport and that no field overflows at 375 wide.

.NET: generator tests for both mappings; the adapter's round trip (`Set` called once per commit, `When` re-evaluated per render); a migration test for the old `PkFieldGroup<TItem>` call shape.

Conformance: `core/tests/tiers.test.mjs` (component tier), `ownership.test.mjs` (the group subscribes only inside its own tree), `element-surface.test.mjs`, the size budgets (component gzip; the kind table moves to a shared js file, so `page-fields.js` shrinks), and `scripts/audit-modules.mjs` shrinks by the module's entries.

---

## 6. Open questions for the owner

1. **Alternative design, same outcome:** instead of a shadow tree, the group could build its controls in **its own light DOM** (the precedent is `pk-doc-page`: elements it creates and owns, slotted). Then no `pk-form` change is needed at all, `form.elements[key]`, native autofill, `<label for>` and `form.reportValidity()` work per control, and the group needs no `FormData` aggregation. Its costs are weaker encapsulation (page CSS reaches the fields) and the group is not itself "a field" (no single validity, no `ElementInternals` value). The spec above follows the decided direction; this is flagged because it is about 150 lines smaller and removes the `pk-form` protocol.
2. **`search` for Blazor:** callback property through interop, or an event plus `SetOptions(key, options)` method? The latter is simpler to generate.
3. **`pk-record-form` new element versus slots on `pk-record-page`** (3.1): the recommendation changes the reason recorded in `blazor/handwritten.baseline.json`.
4. **Breaking scope:** keep `PkFieldGroup<TItem>` as a typed adapter (recommended, source compatible for the generic call shape) or drop the generic and ship only the dictionary API.
5. **Computed values** stay out of scope (as #226 concluded): a computed field is written next to the group.

## 7. Steps (each leaves `main` releasable, about 400 lines of hand-written source)

| # | PR | Contents | Approx. lines |
|---|---|---|---|
| 1 | `pk-field-group` core | `js/field-kinds.js` (shared with `page-fields.js`), the element rendering from `fields`/`values`, `pk-change`, `when`, slots, meta, gallery example, node tests, browser cases 1, 5, 6 | 400 |
| 2 | Form association | `setFormValue(FormData)`, aggregate `setValidity` with anchor, reset/restore/disabled, `problems`/`report`/`checkField`/`focus`, browser case 2 | 250 |
| 3 | `pk-form` protocol | `expand`, summary and first-error focus from groups, live checks through `composedPath`, `pk-invalid.problems`; browser cases 3, 4; scenario `field-group` | 300 |
| 4 | `mountFieldGroup` wrapper | the module becomes a thin wrapper, its baseline entries removed, the existing case green; skill workflow text | 150 (mostly deletions) |
| 5 | Blazor `PkFieldGroup` | mapping, generator, `PkFieldBinding<TItem>` adapter, tests, breaking changelog, Blazor skill | 300 |
| 6 | `pk-record-form` core | element, meta, gallery, browser case 8, scenario `record-form` | 400 |
| 7 | Blazor `PkRecordForm` | mapping, generated component, delete the Razor file and the baseline debt, changelog | 150 |

Steps 1 to 4 are core only; the Blazor files are not touched until step 5, so each PR leaves the repository releasable and the debt entries disappear in the step that deletes their files.
