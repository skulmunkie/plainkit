# A generic Blazor package: one runtime, a typed surface derived from metadata

Status: proposal for owner decision (research only, no product code). Date: 2026-11-12. Base: `main` at 9c44516c.
Owner direction (2026-11-05): the Blazor package keeps only what is functionally required (interop, callbacks, binding plumbing) and builds elements from JSON or a generic recipe, so a new or changed property is not a code change. Typed components and IntelliSense stay, but without a hand-maintained implementation that changes per property.

## 0. Summary and recommendation

1. Do not move generation into the consumer's build (option B) as the main path. A source generator in the consumer project cannot feed the Razor compiler: both are generators over the same input compilation, and a generator never sees another generator's output, so `<PkButton>` in a consumer `.razor` file would not be discovered. This must be proven or killed by the first spike gate (section 6, PR 1), because everything else turns on it.
2. Recommend option D built on A: one **resolved component manifest** (`plainkit.components.json`, derived from `meta.json` / `api.json` plus the mappings, shipped in the package) and one **generic runtime** (descriptor-driven attribute, slot, event, binding and method plumbing in `PkElementBase`). The typed surface (properties, enums, EventArgs, XML docs) is emitted from the manifest **when the package is built**, as today, but each generated component shrinks to declarations plus a static descriptor, with no per-component logic.
3. A new property then costs: edit `meta.json` (and a mapping line only when the C# name or type is not the default), run bootstrap. No hand-written C#. The package is still rebuilt and re-released (the C# type exists at compile time; only option C avoids that, and it has no IntelliSense).
4. The generic typed core stays compiled by hand and is small: `PkListPage<TItem>`, `PkDataTable<TItem>`, `PkTable<TItem>`, `PkFieldGroup<TItem>`, `PkLookupPicker<TItem>`, `PkRecordPage<TItem>`, plus the 12 callback-slot components, the form controls with `EditContext`, and the runtime. These are about 18 of 133 components and carry nearly all the real logic.
5. Do it in 8 small PRs behind a spike that regenerates `PkTray` and `PkButton` from the manifest and proves an identical public API by reflection. If the spike's gate fails, stop at the cheap win in PR 2 (descriptor-driven runtime, same generator).

## 1. What the generator emits today (measured)

All numbers are from the generated tree of a bootstrapped checkout at 9c44516c and from `blazor/`.

### 1.1 Output

| Item | Count | Lines | Notes |
| --- | ---: | ---: | --- |
| Generated `.razor` components | 133 | 9,185 | median 59 lines, max 397 (`PkTable`), 6 over 150 |
| Generated `.cs` files | 6 | 3,880 | `PkGeneratedEnums` 2,337 lines (113 enums), `PkGeneratedEvents` 1,005 (95 EventArgs and the `EventHandlers` map), `PkFieldGroupMembers` 227, `PkTableColumn` 180, `PkModuleManifest` 93, `PkGeneratedAliases` 38 |
| Generated total | 139 files + `.targets` + `generated.manifest.json` | 13,065 lines, 648 KB | CRLF |
| Compiled `PlainKit.Blazor.dll` (a Release build from 2026-10-20, so a lower bound) | 1 | | 1.55 MB |
| Mapping files `blazor/mappings/*.json` | 139 | | 268 KB, 1,466 parameter entries |
| Element API `core/dist/elements/api.json` (the input, from `meta.json`) | 133 elements | | 459 KB |
| Typed generic components (`@typeparam`) | 6 | | `PkTable`, `PkDataTable`, `PkListPage`, `PkFieldGroup`, `PkLookupPicker`, `PkRecordPage` |
| Components using `PkCallbackSlot` | 12 | | the six page types above that load or save, `PkDashboardPage`, `PkDocPage`, `PkDock`, `PkMasterDetailPage`, `PkSettingsPage`, `PkToolPage`, `PkWizardPage` |
| Mappings with `extra: true` parameters | 19 components, 33 parameters | | written into the hand-written `PkElementBase.Extra` partials |
| Mappings marked `existing` | 0 | | the escape hatch is unused |

### 1.2 Classification of what the generated razor contains

Counted line by line over the 133 components (non-blank lines, markup before `@code`, then the code block):

| Construct | Lines | Class |
| --- | ---: | --- |
| `/// <summary>` and remarks | 1,708 | pure data (the `description` of a prop, slot, event) |
| `[Parameter] public T Name { get; set; } = default;` | 1,399 | pure data: name, C# type, default |
| Markup attribute lines (`variant="@(Variant?.ToAttr())"`) | 1,957 | pure data: attribute name, a C# name, a conversion chosen by type |
| Blank lines | 2,129 | none |
| Everything else in `@code` (handlers, `AddEventHandlers`, two-way write-back, `CallAsync` methods, slot spans, `OnAfterRenderAsync`, braces) | 2,125 | the interesting part, split below |

So about 77 % of the lines (docs, parameters, markup, blanks) are data. Of the remaining 2,125:

| Construct | Count | Class |
| --- | ---: | --- |
| `EventCallback.Factory.Create` handlers (one per element event) | 171 handlers, 200 `Handle*` methods | pure data in 150-odd cases (event name, args type, optional bind write-back), real logic in the rest |
| Two-way write-back (`XChanged.InvokeAsync`) | 89 | data: `bind` (52 mapping entries) = event, source (`detail.size` or a fixed value) |
| `CallAsync("show")` methods | 66 | pure data (method name, doc) |
| Slot spans `<span slot="x" class="u-contents">` | 215 `RenderFragment` parameters | data: slot name |
| `ToAttr()` enum conversions | 117 | data: enum type |
| `PkAttr.JsonText` / JSON props | 16 + 6 `json` | data plus one converter kind |
| `PkCallbackSlot` (bridge) | 19 references in 12 components | **logic** |
| `@typeparam TItem` and the `Func`/`RenderFragment<TItem>`/`IReadOnlyList<PkTableColumn<TItem>>` members | 6 components | **logic** (cell templates, row serialisation, `ConfigWithColumns()`) |
| `@bind` on `EditContext`, `ValueExpression` | 15 form controls (no `PkElementBase`) | **logic** |

Mapping parameter entries: of 1,466, **1,168 (80 %)** use only `name`, `type`, `default`, `prop`, `map`, `slot`, `event`. The other 298 carry extra keys; most of those are still declarative: `note` 118 (a doc), `bind` 52, `cancelable` 21, `jsonText` 16, `enum` 12, `inherited` 13. The residue that is code written as data or real logic: `attrExpr` 17 (a raw C# expression string in JSON), `callback` 17 with `arg`/`args` 27, `custom` 8, `returns` 4, `abort` 2, `property` 8, `listened` 7, `refresh` 7, `role` 8, `when`/`unless` 7, plus the 33 `extra` parameters.

### 1.3 The hand-written side

`blazor/handwritten.json` lists **109** files (inventory with fixed categories), budgets in `handwritten.baseline.json` sum to **5,789 lines**, and the debt list is **empty** (the baseline has nothing left to pay):

| Category | Files | What it is |
| --- | ---: | --- |
| runtime | 29 | JS loading, assets, DI, options, stores, shared state |
| dto | 23 | records for JSON, events, enums |
| devtools | 10 | inspector and snapshot host |
| mount | 12 | marker element plus mount bridge (JS owns the content) |
| callback-slot | 9 | `PkCallbackSlot`, `PkCallbackError` and the seven `Testing/*` helpers |
| typed-generics | 9 | row, column, result, store types for the TItem components |
| router | 7 | `NavigationManager`, `PkApp` |
| base | 5 | `PkElementBase` (106 lines), its two partials, `PkTableBase`, `PkModuleBoundary` |
| editcontext | 3 | `PkFormControlBase` (65), `PkRecordEditor` (149 and a 40-line partial) |
| wrapper | 2 | `_Imports.razor`, `PkStyles` |

The package already ships a netstandard2.0 analyzer (`PlainKit.Blazor.Analyzers`, PKB001, packed at `analyzers/dotnet/cs`), so analyzer packaging is not new ground. `PlainKit.Blazor.Tests` is 11,867 lines of C#/razor tests; `GeneratedComponentTests.cs` is 301; the browser harness is `scripts/blazor-browser-cases.mjs` (201) and `blazor-browser-lab-cases.mjs` (578).

### 1.4 Where logic hides in the generator

`scripts/generate-blazor.mjs` is 1,248 lines. `modelElement` (lines 156 to 467) and `renderComponent` (622 to 818) hold the policy: which mapping key produces which C# text. It already derives most of the tag/prop/slot/event facts from `api.json`; the mapping adds C# names, enums, `bind`, `model`/`cells` flags for typed pages. That is the half of a manifest that exists; what is missing is making it a shipped artefact and moving the C# policy out of the generated components and into runtime code.

## 2. The generic runtime and the descriptor

### 2.1 What the runtime owns

`PkElementBase` becomes the one implementation of:

- **Attribute plumbing.** A descriptor lists, per prop: C# name, attribute name, kind (`string`, `bool`, `number`, `date`, `enum`, `json`, `jsonText`, `csv`), default (omit-when-default), nullable. The runtime renders `builder.AddAttribute` for each,. The element tag comes from the descriptor.
- **Slot plumbing.** Descriptor lists slot name and the C# `RenderFragment` (or `RenderFragment<T>`) parameter; the runtime wraps each in `<span slot="x" class="u-contents">` (the rule today in every component).
- **Event plumbing.** Descriptor lists, per element event: event name, args type, optional `bind` (target property, and either a fixed value or a path into the detail, as in `Open` / `Size` of `PkTray`), `cancelable`. The runtime creates the handlers once, writes the bound property back, invokes `XChanged` and then `OnX`.
- **Method plumbing.** `CallAsync(name)` entries (66 today) listed by name and doc.
- **Callback slots and bridge.** `PkCallbackSlot`, `PkCallbackHost`, `PkCallbackError` (unchanged, already generic).
- **Extras** (`PkRequiresExtra`, `CheckExtra`) from the descriptor.

### 2.2 The descriptor: use one new shipped artefact, built from the two existing sources

It cannot be `meta.json` alone: `meta.json` / `api.json` describe the element (JS facts), not the C# projection (a `Variant` of type `ButtonVariant?`, enum member names, `bind`, `Func<PkListRequest, Task<PkListResult<TItem>>>`). It should not be the mappings alone either (they omit docs, defaults and types the element already knows). So:

- `plainkit.components.json` is **generated** by one node step that merges `api.json` and the mappings into a fully resolved record per component: component name, namespace, tier, base class, typeparam, parameters (C# name, C# type, attr, kind, default, doc), slots, events (args type, bind, cancelable), methods, enums (name, members and attribute values), EventArgs shapes (field names and types), required extra. It has a schema (`blazor/components.schema.json`) and a version number, and is shipped in the package under `build/` and as an embedded resource.
- Its content is exactly the facts the generator computes today; moving them into JSON removes policy from generated text and puts it in either the merge step (data) or the runtime (code).
- The mappings stay the human-edited input for the 1,466 parameters that need an override. Defaults come from `meta.json`, so for a new prop with an obvious type no mapping line is needed.

A closed **vocabulary** of kinds replaces today's free text. The 17 `attrExpr` and 8 `custom` entries must each become a named kind (`attr: { kind: "csv" }`) or a named hook into a hand-written partial method (section 2.4). A schema test makes an unknown kind a failure, so JSON never again carries C# code.

### 2.3 Hard cases and how each is expressed

| Case | Descriptor | Needs hand code? |
| --- | --- | --- |
| Enums (`ButtonVariant`) | `enums[]` with members and attribute values; param `kind: enum`; runtime converts through a generated `ToAttr` table | no; the 2,337 lines are data |
| `EventArgs` shapes (`PkOpenEventArgs`) | `events[].args` with typed fields (`string?`, `double?`, `bool?`, `PkFileInfo[]?`) | no; JSON deserialisation by field list; the existing field-type table (`fieldType`) moves into the manifest merge |
| Two-way `@bind-Open`, `@bind-Size` | param plus `XChanged` pair is generated; event `bind` entry tells the runtime what to write back | no for the 52 `bind` entries; the `EditContext` form controls (`ValueExpression`, `FieldIdentifier`, validation messages) stay hand-written (`PkFormControlBase`) |
| Slots and templates | `RenderFragment` parameters generated from `slots[]` | no |
| `TItem` components | `typeparam` in the manifest; the runtime base `PkElementBase<TItem>` is hand-written once and owns row serialisation, cell-slot fill, `Columns`, `IdOf`, `ConfigWithColumns()` | yes, once (the logic in `PkListPage.razor` lines 78 to 145 moves into the base, and `PkTable`, `PkDataTable`, `PkRecordPage` share it instead of repeating it) |
| JSON props (`shape`) | `kind: json`, `shape` names a DTO or an inline shape; the surface is `object?` or a typed record; `jsonText` accepts a string or an object | no |
| Config JSON (`PkListPage.Config`) | `kind: json` plus `configKey` entries; `Initial*` and `Columns` are **config-merge rules** (`configKey: "search"`) | no after 2.1; today they are 11 `configKey` entries plus code in the generated component |
| Callback slot bridge (`Load`, `Save`, `Run`) | `callbacks[]`: element property name, delegate type, argument type, return shaping (`returns`, `abort`) | partly: the delegate types are generic (`Func<PkListRequest, Task<PkListResult<TItem>>>`) so the manifest names them as strings and the typed surface emits them; the 12 components' return mapping (`ToRequest()`, `RowsOf`) stays hand-written in the base |
| JS-interop invokers (`BridgeAsync`, `MountAsync`) | not in the manifest | yes: runtime |
| Testing helpers (`Testing/*`, 356 lines) | not in the manifest; they exercise the runtime | yes: hand-written, and they become the safety net for the migration |

### 2.4 The escape hatch, kept small

A component may name a **hook** (`"hook": "PkListPage.BeforeRender"`) that resolves to a partial method the hand-written part implements. A hook is a manifest field validated at bootstrap and counted by `blazor-wrapper.test.mjs`, so it cannot grow unseen. The target is hooks only for the 6 TItem components, the 15 form controls and the `extra` parameters that need setters.

## 3. Options

Common facts: Razor components in the package are compiled by the Razor SDK. A C# generator cannot emit `.razor` text that Razor then compiles (no chaining), so any generator-in-compiler option emits plain C# classes that derive `ComponentBase` and override `BuildRenderTree`. For `@onpk-open` in consumer markup the `EventHandlers` class (`PkGeneratedEvents.cs`) is still needed; at runtime Blazor picks the args type from the delegate's parameter type, which the spike must confirm.

### A. Build-time generation in the package, from the manifest (data only per property)

The node generator stays; its input becomes `plainkit.components.json`, its output is the existing component shape but thinner (declarations plus a static descriptor, no handlers); the runtime does the rest.

- IntelliSense: unchanged (real types in a referenced assembly, XML docs from the doc file).
- IDE and design time: nothing special (no generators in the consumer). Works in VS, Rider, VS Code, and with the Razor tooling, unchanged.
- AOT and trimming: static descriptor tables with compiled accessors (no reflection) trim and AOT-compile; keep them as generated code, not `System.Reflection`. Slightly larger metadata than today, offset by deleting 171 handlers.
- Hot reload: unchanged for consumers; the package is a binary.
- Compile time for the consumer: none added. Package build: unchanged.
- Debugging: stepping into generated components stays possible; the logic is in one runtime file, easier than 133 copies.
- NuGet size and ceilings: dll should shrink (handlers and markup gone, one table per component); `plainkit.components.json` (estimated 300 to 450 KB, similar to `api.json`) is added as a build asset and could be gzip-embedded; neither `packages.json` ceilings nor `blazorPayload` are raised, so measure first and move it into an existing asset if it does not fit (as the owner rule says: relocate, never raise).
- Versioning: names unchanged (`Pk` + tag), no API change; verified by reflection (section 6).
- Thin-wrapper rule #801: improves it (fewer lines of component logic; hooks are listed).
- bUnit tests and `Testing/*`: unchanged; they run against the same public API, which is why they are the migration's guard.
- Harness cases: unchanged.
- #1656 (separate packages): neutral to good; the manifest records each component's extra, so a package split generates per-package components from one manifest.
- Cost: low. Risk: low. Does it meet the direction? A new prop is a metadata change and a release; no hand-written code. It does not remove recompiling the package.

### B. Roslyn incremental source generator that reads the shipped manifest in the consumer's build

The package carries `plainkit.components.json` as `AdditionalFiles` (via `build/PlainKit.Blazor.props`) and an `IIncrementalGenerator` (netstandard2.0, `analyzers/dotnet/cs`, same slot as PKB001) that emits the typed components in the consumer's compilation.

- What it can do: emit C# classes, enums, EventArgs, partial method declarations, and XML doc comments, deterministic and fast (input is one file; `AdditionalTextsProvider` caches on the file hash, and the manifest changes only when the package is updated).
- What it cannot do, and this decides it:
  1. **Razor discovery.** The Razor compiler is itself a source generator and sees only the input compilation. Components that another generator emits into the same project are not tag-helper-discovered, so `<PkButton />` in `.razor` would not resolve. I am confident of the limitation in principle; the spike (PR 1) must demonstrate it rather than assert it, on the SDK the repo targets. It would work for pure C# (`RenderTreeBuilder`) consumers only, which is not how Blazor apps are written.
  2. It cannot see another generator's output (so it could not generate the `EventHandlers` extension for `@onpk-...` for Razor either, same cause).
  3. It generates for **every** consumer all 133 components (about 13,000 lines of C# into each compile, regardless of use). A filter property (`PlainKitComponents`) can trim, at the price of consumers maintaining a list.
- Design time: VS 17.0+ and SDK 6.0.100+ run incremental generators; Rider and VS Code (C# Dev Kit) run them too, but go-to-definition lands in a generated view, the IDE can lag after a package update until a build, and IntelliSense for the generated types is only as fresh as the IDE's last generator run. A faulty generator shows as an analyzer error (CS8785) far from the cause. Pin `Microsoft.CodeAnalysis.CSharp` to the lowest version that supports `IIncrementalGenerator` (4.x), with `EnforceExtendedAnalyzerRules`.
- AOT and trimming: fine (code is compiled in the app).
- Hot reload: edits to generator output do not hot-reload; a package update needs a rebuild (it always does).
- Compile time: added to every consumer build (warm builds cache the generator step, not the Roslyn compile of 13,000 lines).
- Debugging: generated files are visible only with `EmitCompilerGeneratedFiles`.
- NuGet size: smaller assemblies in the package but a larger analyzer; a second, parallel typed implementation to test.
- Versioning: same names, but Pk types move assembly (from `PlainKit.Blazor` to the consumer's), a **binary-breaking change** for libraries that compile against it, and a conflict when two projects in a solution both reference the package.
- Thin-wrapper test, bUnit: `PlainKit.Blazor.Tests` would need the generator in its own build, and `Testing/*` helpers would reference types that live in the consumer. Harness unaffected.
- #1656: separate packages would each need generator output they cannot see from each other.
- Verdict: only viable for a typed C# builder API, not for Razor markup. Not recommended as the main path; the gate in PR 1 may still find a variant that works (a generator in the package's own build, which is just A with C# instead of node; see below).

### B2. The same generator, run in the package build (not in the consumer's)

A C# incremental generator inside `PlainKit.Blazor` (the package's own project) reading the manifest as `AdditionalFiles`, replacing `generate-blazor.mjs` for the typed surface. Consumers see a normal assembly (A's properties). It removes the node-to-C# hop but not the manifest, adds a netstandard2.0 project and a second language to maintain, and cannot feed `.razor` either (so the generated components would also be plain C#). Same benefit as A for more work: not recommended unless the owner wants the whole toolchain in .NET.

### C. A fully runtime generic component (`<PkElement Name="pk-button" Attributes="...">`)

One component, `DynamicComponent`-style, taking a tag name and an attribute/slot/event bag, validated against the manifest at runtime.

- Floor: zero hand code per property, no package rebuild for a prop; the bag can be fed from JSON.
- Why it is not enough: no IntelliSense, no compile-time checking of names or enum values, no `@bind-Open`, no typed `EventCallback<T>` args, no `Func<...>` templates,. Docs and the Blazor skill (`scripts/skills/plainkit-blazor`) cannot tell an agent what is valid. The owner said typed components stay required. Keep it as a **supported escape hatch** (a hand-written `PkElement` of about 60 lines, category runtime) for elements newer than the installed package.
- AOT: fine. Size: tiny. Back-compat: additive.

### D. Hybrid: generic typed core compiled, the rest derived (recommended, on top of A)

- Compiled by hand, once: the runtime base, `PkElementBase<TItem>` (row, cell and config merge logic taken out of the six generated pages), the callback bridge, the form-control base, the router/app pieces, DTOs that the manifest names.
- Derived from the manifest: every other component, enum, EventArgs and doc comment.
- All effects as in A, plus: the thin-wrapper test gets a **stronger invariant** (generated components contain no logic: a test greps the generated tree for `async Task Handle`, `PkCallbackSlot`, etc. and fails on any); the 6 TItem components shrink because their shared logic leaves the generated text.
- #1656: the TItem base ships in the core package; optional packages contribute manifest fragments (the `extras` field already exists).
- Cost: medium (the one genuinely new piece is `PkElementBase<TItem>`); risk: medium, contained by the existing 11,867 lines of tests.

### Comparison

| | IntelliSense | Razor `<PkX>` works | New prop costs | Consumer build cost | Risk |
| --- | --- | --- | --- | --- | --- |
| A | full | yes | manifest edit and release | none | low |
| B | full, generator lag | **no (to be proven)** | manifest edit and package update | +13k lines per build | high |
| B2 | full | yes | manifest edit and release | none | medium |
| C | none | yes | none (runtime) | none | low, but not what was asked |
| D (on A) | full | yes | manifest edit and release | none | medium |

## 4. What a source generator cannot do, and what stays hand-written

- It cannot create `.razor` files or run before the Razor generator in the same project, so generator output for Razor must be C#, not markup.
- It cannot read another generator's output, and cannot run user code or the node toolchain.
- It cannot express behaviour a manifest has no vocabulary for: `TItem` row serialisation, cell-slot fill, `PkCallbackSlot` argument and result shaping, `EditContext` validation, router guards, devtools, mount bridges. Those 109 files remain, bounded by `handwritten.json` and the baseline.
- It cannot make a property change binary-compatible: adding a parameter is source-compatible, a rename or retype is breaking; the existing API baseline and `[Obsolete]` alias scheme (`PkGeneratedAliases`) still govern it.
- It does not remove the package release: only a runtime bag (C) does.

## 5. Back-compat, packaging, other constraints

- **Names:** `Pk` + tag, namespaces by tier (`PlainKit.Blazor.Components|Pages|Shells`), `.targets` using aliases: unchanged in A and D; checked by `blazor-mappings.test.mjs`.
- **API baseline:** `core/tools/api-surface.mjs` covers the element API, not the .NET surface. Add a reflection snapshot test (public types, members, parameter attributes, generic arity) generated from the built assembly and compared before and after each step; step PR 1 produces the first snapshot from `main`.
- **Package size:** `packages.json` ceilings and `blazorPayload` (`coreOnly` 745,062, `full` 1,073,700) must not rise. A manifest in the package adds bytes; offset by the deleted handler code and by removing `Generated/PkGeneratedEvents.cs`/`Enums.cs` text that duplicates it, or by embedding it compressed. If the measurement shows growth, relocate (build output, not the content), do not raise.
- **Core's own manifest:** the manifest should live in `core/dist` next to `api.json` (the elements package is its source of truth, as the owner direction says) and be copied into `wwwroot/plainkit` only if the runtime needs it at run time; the Blazor package embeds it for the typed surface.
- **Tooling constraints for any C# generator:** netstandard2.0, Roslyn 4.x `IIncrementalGenerator`, value-equatable pipeline models (records or `IEquatable`) so the cache holds, no `Compilation` in the model, analyzer DLL under `analyzers/dotnet/cs`, `PrivateAssets=all`. Rider and VS Code need no extra setup but need a rebuild to refresh generator output.
- **Documentation and skills:** the Blazor skill (`scripts/skills/plainkit-blazor/SKILL.md`, 217 lines) and `components-index.md` are generated from the same data; adding the manifest improves them (an agent can read valid parameters and enums from one file).

## 6. Migration plan (small PRs, each leaves main releasable)

Each PR is about 400 lines of hand-written source (generated files do not count), adds a changelog fragment when it changes visible behaviour (none of them should), runs the targeted `node scripts/verify.mjs --changed`, plus a filtered `dotnet test`.

0. **PR 0 (tests first): reflection snapshot.** A test that dumps the public surface of `PlainKit.Blazor` (types, members, `[Parameter]`, generic arity, `EventCallback` types) to a committed JSON snapshot; the .NET equivalent of an API baseline. Also records the compiled-size and package-size numbers. No product change.
1. **PR 1, the spike (research gate, may end here).** On a branch: (a) emit `plainkit.components.json` for two components, **`PkTray` and `PkButton`** (a `bind` pair with two events and an enum, a link/flag set, slots, methods); (b) a prototype `PkElementBase` that renders them from the descriptor; (c) regenerate those two from the manifest and show the reflection snapshot is **identical** and `GeneratedComponentTests` plus the two components' bUnit tests pass; (d) a throwaway consumer project that tries option B (a generator in the project) and records whether `<PkTray>` resolves in a `.razor` file. Gate: (c) must be identical; (d) decides whether B survives. Then repeat (c) for `PkListPage<TItem>` to prove the TItem base.
2. **PR 2: manifest generation as data.** `scripts/generate-blazor-manifest.mjs` merges `api.json` and mappings into `plainkit.components.json`, with schema and a test that fails on an unknown mapping kind. Generated, not committed. No change to emitted components.
3. **PR 3: descriptor-driven runtime.** `PkElementBase` renders attributes, slots, events, binding, methods from a descriptor; the generator emits the descriptor and the declarations for the **simple 80 %** (no callbacks, no TItem, no extras); the rest keep the old shape. Reflection snapshot and the Blazor browser harness (`blazor-browser.mjs --changed`) must be green.
4. **PR 4: extend to events with `bind` and `cancelable`, and to `extra` parameters** (19 components, 33 parameters), removing `extra` handling from `PkElementBase.Extra`.
5. **PR 5: `PkElementBase<TItem>`.** Move the shared `PkListPage`/`PkDataTable`/`PkTable`/`PkRecordPage` row, cell and config logic out of the generated text into a hand-written base (about 150 lines), generated components shrink to declarations. `blazor/handwritten.baseline.json` budgets for the touched files must go down.
6. **PR 6: callback slots in the descriptor** (`callbacks[]`: element property, delegate type, argument type, return shaping) for the 12 components; `Testing/*` helpers stay.
7. **PR 7: enums, EventArgs and docs from the manifest only.** Delete the policy in `generate-blazor.mjs` that duplicates it; add the invariant test that the generated tree contains no `Handle*`, `CallAsync` or `PkCallbackSlot` text; update the Blazor skill and `AGENTS.md`/`CONTRIBUTING.md` ("a new prop is a `meta.json` edit").
8. **PR 8 (optional): `PkElement`** runtime escape hatch (C) and a docs page. Only after the owner confirms the question below.

Measuring checks across all PRs: the reflection snapshot (zero diff, or each diff an intended `[Obsolete]`), `node scripts/blazor-browser.mjs` (all cases), `node scripts/check-package.mjs` (size ceilings), `blazor-wrapper.test.mjs` (budgets only go down), `dotnet test` (11,867 lines of tests) on the integration tree, one measured run of build time (`dotnet build` of the sample, before and after).

## 7. Risks

- **Descriptor creep.** A vocabulary that grows a kind per odd case becomes a second programming language in JSON (`attrExpr` and `custom` are already that). Mitigation: schema-validated closed kinds; anything else is a hook or stays hand-written; a count of hooks is a gate.
- **Runtime slower or larger than inlined code.** A descriptor loop per render replaces inlined markup. Mitigation: descriptor tables built once per type, static accessors, a benchmark in PR 1 (render 1,000 `PkButton` and compare).
- **Razor semantics.** Generated `BuildRenderTree` must keep `ElementReference`, `@attributes` order, `class` merging and unmatched attributes behaving exactly (`AttributePassthroughTests`, `ElementReferenceTests`); a miss shows as a subtle regression, not a compile error. The spike must cover them.
- **Event typing.** If runtime event-args resolution does not work without the `EventHandlers` map for generated components, the map stays generated (it is data).
- **Trim/AOT.** Any accidental `Type.GetProperty` would break trimming; a trim test (publish with `PublishTrimmed`) is part of PR 3.
- **Double maintenance during migration.** Old and new generators coexist for PRs 3 to 7; the reflection snapshot is the only thing keeping them honest, so PR 0 comes first.
- **Package ceilings.** The manifest adds payload; if it does not fit it must be relocated or shrunk, never a raised ceiling.

## 8. Questions only the owner can answer

1. Does "without recompiling code" mean no hand-written code per property (A/D deliver this), or no package release for a property change (only C delivers this, untyped)? The recommendation assumes the first.
2. Is a generator in the consumer's build (B) still wanted for a **C#-only** typed API (no Razor markup) after the spike shows the Razor limitation? It would be a second API, not a replacement.
3. May the package grow a manifest file (about 300 to 450 KB uncompressed) if the dll shrinks by a similar amount, or must it be embedded compressed or kept in `core/dist` only?
4. Is a binary-incompatible move of the Pk types (B) acceptable, or must `PlainKit.Blazor` keep owning every public type (A/D)?
5. Hooks: may the manifest name hand-written partial methods (a bounded escape hatch, counted by the wrapper test), or must a component with logic stay fully hand-written?
6. Should the runtime escape hatch `PkElement` (C) ship publicly, so an app can use an element newer than its installed package?
7. Order against #1656: split into separate packages first (generate from one manifest per package) or after this change?
8. Is the C#-side toolchain acceptable as a second source language (B2), or must generation stay in node?
