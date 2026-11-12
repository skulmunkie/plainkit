// Lazy part of <pk-table>: a column with type "media" (issue 1938). The cell is a box reserved at the floor height (size sm, md or lg) with its width from the
// ratio, so nothing moves when the image loads; a plain <img> fills it and a taller row crops it. The rules live in one adopted sheet shared by every table.
const sheet = new CSSStyleSheet();
sheet.replaceSync('td[data-media]{--_h:var(--pk-table-media-h,calc(var(--space-12)*1.5));position:relative;box-sizing:border-box;padding:0;block-size:var(--_h);inline-size:calc(var(--_h)*var(--_r,1));max-inline-size:calc(var(--_h)*var(--_r,1));background:var(--color-surface-alt)}'
    + 'td[data-media="sm"]{--_h:var(--pk-table-media-h,var(--space-12))}td[data-media="lg"]{--_h:var(--pk-table-media-h,calc(var(--space-12)*2))}'
    + 'td[data-media] img{position:absolute;inset:0;inline-size:100%;block-size:100%;object-fit:cover}td[data-fit="contain"] img{object-fit:contain}');
const ratio = r => { const [a, b = 1] = String(r ?? 1).split('/'); return +a > 0 && +b > 0 ? +(a / b).toFixed(4) : 1; };

/** The td of a media column for one row: the row value is the image URL, `alt` names the row key holding its text (empty, so decorative, by default). */
export function cell(c, row, h) {
    const td = h('td', { 'data-key': c.key, 'data-media': c.size ?? 'md', 'data-fit': c.fit, 'data-label': c.title ? null : c.label ?? c.key, 'data-hide-phone': c.hidePhone, 'data-shed': c.shed }), img = h('img', { src: row[c.key], loading: 'lazy', decoding: 'async' });
    img.alt = String(row[c.alt] ?? ''); td.style.setProperty('--_r', ratio(c.ratio)); td.append(img);
    return td;
}

export function after(t) {
    const r = t.shadowRoot;
    if (!r.adoptedStyleSheets.includes(sheet)) r.adoptedStyleSheets = [...r.adoptedStyleSheets, sheet];
}
