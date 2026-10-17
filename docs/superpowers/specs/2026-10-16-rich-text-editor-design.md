# Rich-text editing: requirements and design (refs #330)

Status: proposal for owner decision. Research and design only; no product code. Supersedes the "keep parked" recommendation on #330: the owner says a rich-text editor
would be reused in other projects, so it is a real consumer and the issue is open for design.

## 1. Evidence on main

- `pk-textarea` (tier `element`, form-associated, `value` with commit event `pk-value-change`) is plain text only. Nothing composes a rich editor.
- `core/js/sanitized-html.js` is a sink for markup a build step already sanitised. It is NOT a runtime sanitiser and must not be used for user input.
- `core/components/toolbar` (tier `component`) exists; so do `pk-tabs`, `pk-button-group`, `pk-field`, `pk-tag-input` (a form-associated value precedent).
- CSP is `script-src 'self'; style-src 'self'`; `innerHTML`-style sinks are counted in `core/tools/security.allow.json`; tokens only; budgets never raised; no cross-origin loads.
- Blazor is a thin 1:1 wrapper generated from `blazor/mappings/<name>.json`.

## 2. Scope: smallest first

In: one element, `pk-markdown-editor` (name open, see Q5), whose `value` is Markdown text. Writing surface plus a toolbar (bold, italic, bullet list, numbered list, link,
later heading, quote, code) plus a Preview. Form-associated, labelled, disabled/readonly/required/maxlength, `pk-change`.

Out for v1: tables, images and uploads, mentions, collaboration, HTML output, a third-party editor, inline WYSIWYG formatting (phase 6), slash menus, embeds.

Markdown subset (CommonMark core, deliberately small): paragraphs, `**bold**`, `*italic*`, `-` and `1.` lists (one nesting level), `[text](url)`, `` `code` ``, fenced code, `>` quote,
`#` to `###` headings. Raw HTML in the source is NOT rendered (shown as text). Links allow only `http:`, `https:`, `mailto:` and relative URLs.

## 3. Approaches compared

| | A. textarea + toolbar + preview (recommended) | B. contenteditable WYSIWYG |
| --- | --- | --- |
| Source of truth | the Markdown string in a real textarea | a DOM tree mapped back to Markdown |
| IME, undo, spellcheck, selection, screen readers | native, correct | hand-built; the usual source of data-loss bugs; `execCommand` is deprecated |
| Security | nothing renders until preview; preview built with DOM APIs from a parsed tree | pasted/dropped HTML is the attack surface; needs a sanitiser |
| Size | small: toolbar logic plus a lazy renderer | much larger; 800+ lines for a minimal one |
| UX | Write/Preview, familiar to technical users | what-you-see; better for non-technical users |
| Round trip | exact (the text is the value) | lossy normalisation risk |

Decision: ship A. B is phase 6 and only if the owner shows a non-technical audience; it reuses A's parser and value contract, so nothing is thrown away.

## 4. Design (approach A)

- Composition: `pk-toolbar` + `pk-button` (icon buttons with aria names; no `aria-pressed`, Markdown has no persistent state) + an inner textarea + `pk-tabs` Write/Preview (optional `layout="split"` on wide screens).
- Tier: `component` (renders pk-toolbar, pk-button, pk-tabs; C4 forbids that in tier `element`); names only element or component tiers (C1). Folder `core/components/markdown-editor/`.
- Commands are pure functions `(text, selStart, selEnd, command) -> { text, selStart, selEnd }` in their own module, unit-testable in Node without a DOM. Applied with `setRangeText` so the browser undo stack survives; `execCommand` is not used.
- Preview: `renderMarkdown(text) -> DocumentFragment` in a lazy chunk, loaded on first Preview. Parse to a small AST, then build nodes with `createElement`/`textContent`/`setAttribute`. No `innerHTML`, no new `security.allow.json` entry. Links get `rel="noopener noreferrer"`; scheme allow-list; no `style`, no event attributes, no images in v1.
- Ownership and reactivity (STANDARDS): host owns attributes; element owns its shadow tree; document-level listeners added in `connected()` and removed in `disconnected()`; no new base-class hooks.
- API: props `value` (commit event `pk-change { value }`), `name`, `label` (accessible name), `placeholder`, `disabled`, `readonly`, `required`, `maxlength`, `rows`, `mode` (`write` | `preview`), `layout` (`tabs` | `split`), `toolbar` (space-separated command list; default `bold italic heading quote ul ol link`). No slots in v1.
- Form behaviour: form-associated; reset/restore/disabled callbacks as `pk-textarea`; `required` through `setValidity`.

## 5. Security

1. Output is Markdown text, so stored data carries no markup by itself. The risk moves to wherever a consumer renders it: the element exports `renderMarkdown` so consumers render through the same safe path, and the docs say never to feed `value` to `innerHTML`.
2. Preview and `renderMarkdown` never use string-to-HTML sinks; unknown syntax degrades to text; `javascript:`, `data:`, `vbscript:` dropped (compared after trimming, lowercasing and stripping control characters).
3. CSP: no inline style or `<style>`; styling through the shadow stylesheet and tokens. No eval, no cross-origin.
4. Paste: a native textarea inserts plain text only, so there is no HTML paste path in approach A (an advantage over B).
5. A hostile-corpus node test (script tags, `[x](javascript:...)`, nested emphasis, 1 MB lines, deep nesting) asserts the fragment has no `script`, no `on*` or `style` attributes, and bounded time (linear parser; preview input capped, for example 200 KB, with a message beyond it).
6. If phase 6 is built: the model is the AST, not the DOM; paste is parsed (text/plain preferred; text/html mapped through an allow-list into the AST, never inserted). The only sanitiser would be written against the AST.

## 6. Accessibility, keyboard, IME

- The writing surface is a real textarea with an accessible name. Toolbar is `role="toolbar"` with a name, roving tabindex, Left/Right, Home/End; one Tab stop; Esc returns focus to the textarea.
- Shortcuts only while the textarea has focus: Ctrl/Cmd+B, Ctrl/Cmd+I, Ctrl/Cmd+K; `aria-keyshortcuts` set and shown in tooltips. Tab leaves the field (no keyboard trap).
- Write/Preview tabs follow `pk-tabs`; the preview is a named region; switching keeps selection and scroll.
- IME: nothing acts during composition (`isComposing`, `compositionstart`..`compositionend` gate shortcuts and any input-driven transform); commands run only on explicit user action.
- 24 px minimum targets; focus rings unclipped; usable at 375 px with overflow into a `pk-menu` (the existing toolbar overflow pattern); zoom and forced-colors safe; RTL mirrors order and arrow direction.

## 7. Size budget

- The shell (toolbar, commands, textarea glue) stays within the component budget; the parser and preview renderer are a lazy chunk loaded on first Preview or on import of `renderMarkdown`. Future heavy features (tables, highlighting) get their own lazy chunks.
- No budget is raised. If the shell is over, relocate: the command table and link dialog move to the lazy chunk, loaded on first toolbar interaction; first paint is a plain labelled textarea.
- Targets, to be measured in phase 1 and recorded on the issue (not promised): shell about 2 KB gzip, chunk about 3 KB gzip.
- The element stays out of the app static entry graph (22 KB hard cap); it loads through the registry on use.

## 8. Blazor

`blazor/mappings/markdown-editor.json` generates `PkMarkdownEditor`: `Value`/`ValueChanged` (`@bind-Value` on `pk-change`), `Label`, `Placeholder`, `Disabled`, `ReadOnly`, `Required`, `MaxLength`, `Rows`, `Mode`, `Layout`, `Toolbar`; works in `EditForm` like `PkTextarea`. No hand-written file, no timers or guards (binding timing is solved in core by committing on `pk-change` only). A `markdown` `PkFieldKind` is a separate later step.

## 9. Acceptance criteria: measuring browser cases (`core/tests/browser/`, written before the CSS)

1. Select `word`, click Bold: value is `**word**`, selection still covers `word`; click again unwraps. Same for italic.
2. Ctrl+B in the textarea wraps the selection; the default of Ctrl+B is not prevented on a sibling input outside the editor.
3. Bullet/numbered list on a three-line selection prefixes each line; a second click removes; numbering is 1., 2., 3.
4. Link with selection `site` and URL `https://x.test` gives `[site](https://x.test)`; `javascript:alert(1)` is refused with an inline error and the value is unchanged.
5. Ctrl+Z after a toolbar command restores the previous value in one step.
6. Tab reaches the toolbar once; Left/Right move between buttons (`document.activeElement` checks); every control has a non-empty accessible name; the toolbar has a name.
7. Preview of `<script>alert(1)</script> **b** [x](javascript:1)` has no `script` element, no `href` starting `javascript:`, contains `strong`, and no `on*` or `style` attribute in the subtree.
8. Round trip: set `value`, read it back identical (CRLF, trailing spaces, emoji, RTL); form reset restores it; `FormData` carries it under `name`.
9. IME: `compositionstart`, Ctrl+B keydown, `compositionend`: no command applied during composition; textarea content unchanged by the element.
10. At 375 px: toolbar and tabs share one row or overflow into a menu with no horizontal page scroll (`t.within` host rect); focus ring unclipped on first and last control (`t.ringUnclipped`); tap targets at least 24 px.
11. At 1280 px, split layout puts write and preview side by side (rect comparison), equal height, preview scrolls independently.
12. `disabled` blocks commands and removes the toolbar from the tab order; `readonly` allows Preview but no commands; a command that would exceed `maxlength` is a no-op.
13. Size guard: a node test fails if the shell or the chunk exceeds its recorded gzip cap; the shell never imports the chunk statically (graph test).
14. UI-review scenarios: Preview open, link dialog open, narrow overflow menu open, RTL, dark, forced-colors; every screenshot read with the Read tool.

## 10. Phased plan (each step leaves main releasable, about 400 lines or fewer)

1. Pure core: Markdown AST parser, `renderMarkdown` (lazy chunk), commands module, node tests, hostile-corpus test, size measurement. No element.
2. Element shell `pk-markdown-editor`: Write mode, toolbar (bold, italic, lists, link), form association, `meta.json`, docs page, gallery samples, changelog, skills note; cases 1 to 8 and 12.
3. Preview tab and split layout; cases 7 and 11; UI-review scenarios.
4. Blazor mapping and sample; cases 9, 10, 13, 14; skills updated.
5. Polish: heading, quote, code, list continuation on Enter, paste-URL-as-link.
6. Optional, owner-gated: contenteditable WYSIWYG mode over the same AST (own spec first).

Every step: changelog fragment, `node scripts/verify.mjs --changed`, `--browser`, and ui-review for visual steps.

## 11. Risks

Markdown dialect mismatch with a consumer's renderer (export ours, document the subset); parser performance on huge input (linear, capped); toolbar overflow edge cases; users expecting WYSIWYG (phase 6); tier rules (component, not element); parser maintenance (small subset, corpus tests).

## 12. Owner questions (recommended default)

1. Textarea + toolbar + preview first, WYSIWYG later only if needed? (Yes.)
2. Output Markdown, never HTML? (Markdown.)
3. v1 = bold, italic, lists, link, preview; no images, tables or raw HTML? (Yes.)
4. Own small parser, nothing vendored? (Yes.)
5. Name `pk-markdown-editor` or `pk-rich-text`? (`pk-markdown-editor`.)
6. Does the first consumer need WYSIWYG soon (non-technical users)? (No; revisit after phase 4.)
7. Export `renderMarkdown` for read-only display, a display element later on request? (Yes.)
