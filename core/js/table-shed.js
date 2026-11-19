// Lazy part of <pk-table>: a column's `shed` given as a width (issue 1684). table.css has the steps 1, 2 and 3 (24, 36, 48rem); any other value is a length
// ("60rem", "900px") or a number of rem above 3, and this module writes the same container rule for it into an adopted style sheet, so the table's own width
// decides (not the viewport), windowed rows and a resize need no script, and the phone cards layout keeps every column (its td rule is more specific).
const sheets = new Map(); // one sheet per distinct text, shared by every table
const sheetFor = css => sheets.get(css) ?? (s => (s.replaceSync(css), sheets.set(css, s), s))(new CSSStyleSheet());
const LENGTH = /^(\d*\.?\d+)(rem|px)?$/;

/** The container query width of a shed value ("60rem", "900px", 72 = 72rem), or null for the steps 1 to 3 and for a value that is not a width. Pure. */
export function shedWidth(shed) {
    const m = LENGTH.exec(String(shed ?? '').trim());
    return m && (m[2] || +m[1] > 3) ? `${m[1]}${m[2] ?? 'rem'}` : null;
}

/** True when a column's shed needs this module. Pure. */
export const needsWidth = c => c.shed != null && c.shed !== '' && shedWidth(c.shed) !== null;

/** The style sheet text for these columns: one rule per distinct width. Pure. */
export function shedCss(columns) {
    const seen = new Map();
    for (const c of columns) { const w = needsWidth(c) && shedWidth(c.shed); if (w) seen.set(String(c.shed).trim(), w); }
    return [...seen].map(([shed, w]) => `@container (max-width:${w}){[data-shed="${shed}"]{display:none}}`).join('');
}

// A pinned column (`pin`, the row-actions column of pk-data-table, #2046): sticky at the inline end on an opaque ground, header text for screen readers only, one footer line in a phone card, not printed.
const PIN = ('td[data-pin],th[data-pin]{position:sticky;inset-inline-end:0;z-index:1;background:var(--color-panel);inline-size:1%;white-space:nowrap}td[data-pin] slot::slotted(span){display:flex;gap:var(--space-1);justify-content:flex-end}th[data-pin]{font-size:0}@media print{[data-pin]{display:none}}'
    + '@media (max-width:640px){:host([cards]) td[data-pin]{position:static;inline-size:auto;background:none;justify-content:flex-end;margin-block-start:var(--space-1);padding-block-start:var(--space-2);border-block-start:1px solid var(--color-border)}:host([cards]) td[data-pin]::before{content:none}}');

let pinSheet; // built on first use (the sheet needs a browser)
export function after(t) {
    if (t.list('columns').some(c => c.pin)) { pinSheet ??= (x => (x.replaceSync(PIN), x))(new CSSStyleSheet()); if (!t.shadowRoot.adoptedStyleSheets.includes(pinSheet)) t.shadowRoot.adoptedStyleSheets = [...t.shadowRoot.adoptedStyleSheets, pinSheet]; }
    if (t.list('columns').some(c => c.type === 'media')) t.lz('$mm', () => import('./table-media.js')); // the media column kind (#1938) rides on this part's load
    t.$mm?.after(t);
    const css = shedCss(t.list('columns')), root = t.shadowRoot;
    if (css === t.$shedCss) return;
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter(s => s !== t.$shedSheet);
    t.$shedCss = css; t.$shedSheet = css ? sheetFor(css) : null;
    if (css) root.adoptedStyleSheets = [...root.adoptedStyleSheets, t.$shedSheet];
}
