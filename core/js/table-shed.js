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

export function after(t) {
    const css = shedCss(t.list('columns')), root = t.shadowRoot;
    if (css === t.$shedCss) return;
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter(s => s !== t.$shedSheet);
    t.$shedCss = css; t.$shedSheet = css ? sheetFor(css) : null;
    if (css) root.adoptedStyleSheets = [...root.adoptedStyleSheets, t.$shedSheet];
}
