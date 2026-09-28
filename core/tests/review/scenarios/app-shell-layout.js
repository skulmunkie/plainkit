// pk-app-shell without a nav (issues 320, 308) and its scrolling body as a containing block (issue 302). A shell with nothing in its nav slot gives the main column the full width
// (header, body and footer span the window); an absolutely positioned descendant of the page (a table's visually hidden bits) resolves against the body, so it cannot make the document scroll.
const columns = JSON.stringify([{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }]);
const rows = JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` })));
const BODY = 'pk-app-shell >>> [part=body]';
const HEADER = 'pk-app-shell >>> [part=header]';
const FOOTER = 'pk-app-shell >>> [part=footer]';

export default {
    name: 'app-shell-layout',
    issue: [320, 308, 302],
    elements: ['app-shell'],
    html: `<pk-app-shell>
<h2 slot="title">Title and back link</h2>
<pk-card id="card" heading="A page with no nav"><p>The shell has nothing in its nav slot, so this page takes the full width.</p></pk-card>
<pk-table id="t" label="Products" caption="Stock by product" columns='${columns}' rows='${rows}'></pk-table>
<span slot="footer">Acme Inc.</span>
</pk-app-shell>`,
    steps: [{ wait: 'settle' }, { shot: 'idle' }],
    expect(t) {
        const w = t.viewport.width;
        for (const [name, sel] of [['header', HEADER], ['body', BODY], ['footer', FOOTER]]) {
            const r = t.rect(sel);
            if (r) t.ok(r.width >= w - 1, `without a nav the shell's ${name} is ${Math.round(r.width)}px wide in a ${w}px window: the main column must take the full width (issues 320, 308)`);
        }
        t.styleIs(BODY, 'position', 'relative'); // a containing block for the page's absolutely positioned content (issue 302; the document-level effect is the browser case in cases-headers.js)
    },
};
