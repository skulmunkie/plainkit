// The demo's view helpers, standing in for the page types of steps 5 to 7 (a list page and a record page will replace `table` and `facts`). Markup from elements only, no style and
// no class; every string is data, so it goes in with textContent or as a JSON attribute.
const make = (doc, tag, attrs = {}, text) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    return el;
};
const stack = (doc, ...kids) => { const s = make(doc, 'pk-stack', { gap: 'md' }); s.append(...kids); return s; };

// A list page: the records are the rows, and choosing a row opens its record route (module-relative '/<id>').
export const table = (heading, columns, rows) => (host, ctx) => {
    const doc = host.ownerDocument, grid = make(doc, 'pk-table', { label: heading, clickable: '', hover: '', columns: JSON.stringify(columns), rows: JSON.stringify(rows) });
    ctx.on(grid, 'pk-row-click', e => ctx.navigate(`/${e.detail.id}`));
    host.append(stack(doc, make(doc, 'h1', {}, heading), grid));
};

// A record page: a heading and the record's fields. pk-field-list's items property is data-driven (a JSON attribute), so a strict module
// never has to write dt/dd itself.
export const facts = (heading, pairs) => host => {
    const doc = host.ownerDocument;
    const items = pairs.map(([label, value]) => ({ label, value }));
    const list = make(doc, 'pk-field-list', { items: JSON.stringify(items) });
    const card = make(doc, 'pk-card', { heading: 'Details' });
    card.append(list);
    host.append(stack(doc, make(doc, 'h1', {}, heading), card));
};
