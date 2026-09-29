// One wrong/right snippet per rule (design sections 8 and 10, issue #518 A-8): the single source both
// rules.test.mjs (runs every "wrong" through the engine expecting the rule's id, every "right" expecting none)
// and scripts/build-skills.mjs (renders them into references/conformance-rules.md) read, so the documentation
// can never show a wrong/right pair the engine does not actually agree with - a test failure catches drift on
// either side. `path`/`rightPath` pick an extension the rule's `applies()` accepts; `rightPath` is only given
// when the right snippet needs a different one than `path`.
//
// T7 (a deprecated element or attribute) has no real entry yet (design section 2.4: "empty on day one" - see
// core/tools/audit/hints.mjs's DEPRECATED_ELEMENTS) so it has no case here; core/tools/audit/rules.test.mjs
// tests its mechanism directly instead, and both it and scripts/build-skills.mjs skip T7's example rendering.
export const MANUALLY_TESTED = new Set(['T7']);

export const EXAMPLES = [
    { id: 'S1', path: 'app.css', wrong: '.a { color: red; }', right: 'const x = 1;', rightPath: 'app.js' },
    { id: 'S2', path: 'app.js', wrong: "el.style.color = 'red';", right: 'const width = compute();' },
    { id: 'S3', path: 'app.html', wrong: '<div class="foo"></div>', right: '<div></div>' },
    { id: 'S4', path: 'app.html', wrong: '<button>Click</button>', right: '<pk-button>Click</pk-button>' },
    { id: 'S5', path: 'app.js', wrong: "el.innerHTML = '<b>hi</b>';", right: "el.textContent = 'hi';" },
    { id: 'S6', path: 'app.js', wrong: "import foo from 'some-lib';", right: "import { mountApp } from 'plainkit';" },
    { id: 'S7', path: 'app.js', wrong: "document.querySelector('a');", right: 'state.value = 1;' },
    { id: 'S8', path: 'app.js', wrong: "mountApp({ page: 'custom' });", right: "mountApp({ page: 'list' });" },
    { id: 'S9', path: 'app.css', wrong: '.a { color: #ff0000; }', right: '.a { color: var(--color-danger); }' },
    { id: 'D1', path: 'app.html', wrong: '<table></table>', right: '<pk-table></pk-table>' },
    { id: 'D2', path: 'app.html', wrong: '<div class="modal">x</div>', right: '<pk-dialog>x</pk-dialog>' },
    {
        id: 'D3',
        path: 'app.js',
        wrong: "el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move);",
        right: "el.addEventListener('click', start);",
    },
    {
        id: 'D4',
        path: 'app.js',
        wrong: "el.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') go(); if (e.key === 'ArrowRight') go(); });",
        right: "el.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });",
    },
    { id: 'D5', path: 'app.js', wrong: "root.querySelectorAll('[tabindex]');", right: "root.querySelectorAll('.item');" },
    { id: 'D6', path: 'app.js', wrong: "node.role = 'dialog';", right: "node.type = 'dialog';" },
    { id: 'D7', path: 'app.js', wrong: 'dialogEl.showModal();', right: 'dialogEl.show();' },
    { id: 'D8', path: 'app.css', wrong: 'pk-dialog { color: red; }', right: 'pk-dialog::part(header) { color: red; }' },
    { id: 'D9', path: 'app.css', wrong: '.row { display: flex; gap: 8px; }', right: '.row { display: block; }' },
    { id: 'T1', path: 'app.css', wrong: '.a { color: #ff0000; }', right: '.a { color: var(--color-danger); }' },
    { id: 'T2', path: 'app.css', wrong: '.a { padding: 12px; }', right: '.a { padding: var(--space-3); }' },
    { id: 'T3', path: 'app.css', wrong: ".a { font-family: 'Arial', sans-serif; }", right: '.a { font-family: var(--font-sans); }' },
    { id: 'T4', path: 'app.css', wrong: '.a:focus { outline: none; }', right: '.a:focus { outline: none; box-shadow: 0 0 0 2px blue; }' },
    { id: 'T5', path: 'app.css', wrong: '.a { color: var(--colr-typo); }', right: '.a { color: var(--color-critical); }' },
    { id: 'T6', path: 'app.html', wrong: '<pk-buttonn>Save</pk-buttonn>', right: '<pk-button>Save</pk-button>' },
    { id: 'T8', path: 'app.js', wrong: "import { PkButton } from 'plainkit/elements/elements.js';", right: "import { PkButton } from 'plainkit/elements/button.js';" },
    { id: 'A1', path: 'app.html', wrong: '<pk-button icon variant="ghost"></pk-button>', right: '<pk-button icon variant="ghost" label="Add"></pk-button>' },
    { id: 'A2', path: 'app.html', wrong: '<pk-input></pk-input>', right: '<pk-input label="Name"></pk-input>' },
    { id: 'A3', path: 'app.html', wrong: '<pk-dialog></pk-dialog>', right: '<pk-dialog heading="Discard?"></pk-dialog>' },
    { id: 'A4', path: 'app.html', wrong: '<div onclick="go()"></div>', right: '<pk-button>Go</pk-button>' },
    { id: 'A5', path: 'app.html', wrong: '<h1>One</h1><h1>Two</h1>', right: '<h1>One</h1><h2>Two</h2>' },
    { id: 'A6', path: 'app.html', wrong: '<pk-badge variant="danger"></pk-badge>', right: '<pk-badge variant="danger">Failed</pk-badge>' },
    { id: 'A7', path: 'index.html', wrong: '<html><body></body></html>', right: '<html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><main></main></body></html>' },
    { id: 'A8', path: 'app.css', wrong: 'pk-button { min-height: 0; }', right: 'pk-button { min-height: 44px; }' },
    {
        id: 'P1',
        path: 'index.html',
        wrong: '<html><body><header>Site</header><nav>Home</nav><script type="module" src="app.js"></script></body></html>',
        right: '<html><body><script type="module">mountApp(document.body, { modules: [] });</script></body></html>',
    },
    {
        id: 'P2',
        path: 'app.js',
        wrong: "mountApp(document.body, { pages: { home: {} } });",
        right: "mountApp(document.body, { modules: [orders] }); defineModule({ id: 'orders', title: 'Orders', routes: [] });",
    },
    {
        id: 'P3',
        path: 'app.js',
        wrong: "defineModule({ id: 'orders', routes: [{ path: '/', page: 'custom', config: { mount(host) { host.innerHTML = '<pk-table></pk-table><pk-toolbar></pk-toolbar>'; } } }] });",
        right: "defineModule({ id: 'orders', routes: [{ path: '/', page: 'list', config: { columns: [] } }] });",
    },
    {
        id: 'P4',
        path: 'app.html',
        wrong: '<pk-app-shell></pk-app-shell><header>Custom header</header><nav>Custom nav</nav>',
        right: '<pk-app-shell><pk-navbar></pk-navbar></pk-app-shell>',
    },
    {
        id: 'P5',
        path: 'app.js',
        wrong: "defineModule({ routes: [{ path: '/', page: 'list', config: { mount(host) { host.innerHTML = '<div class=\"pager\">Next</div>'; } } }] });",
        right: "defineModule({ routes: [{ path: '/', page: 'list', config: { columns: [], empty: 'None yet' } }] });",
    },
    {
        id: 'P6',
        path: 'app.js',
        wrong: "mountApp(document.body, {}); const q = localStorage.getItem('q');",
        right: "defineModule({ id: 'orders', state: { defaults: { q: '' } } });",
    },
    {
        id: 'P7',
        path: 'app.js',
        wrong: "defineModule({ routes: [{ path: '/', page: 'list', config: { columns: [] } }] });",
        right: "defineModule({ routes: [{ path: '/', page: 'list', config: { columns: [], empty: 'No rows', error: 'Failed', loading: true } }] });",
    },
    {
        id: 'P8',
        path: 'app.js',
        wrong: "defineModule({ routes: [{ path: '/', page: 'lsit', config: {} }] });",
        right: "defineModule({ routes: [{ path: '/', page: 'list', config: {} }] });",
    },
    {
        id: 'P9',
        path: 'app.html',
        wrong: '<a href="#/orders/42">Order</a>',
        right: '<pk-nav-link onclick="ctx.navigate(\'/orders/42\')">Order</pk-nav-link>',
    },
    { id: 'B1', path: 'App.razor', wrong: '<table></table>', right: '<PkTable></PkTable>' },
    { id: 'B2', path: 'App.razor', wrong: '<PkButton Class="primary"></PkButton>', right: '<PkButton Variant="ButtonVariant.Primary"></PkButton>' },
    { id: 'B3', path: 'App.razor', wrong: '<PkButton Sizee="ButtonSize.Small"></PkButton>', right: '<PkButton Size="ButtonSize.Small"></PkButton>' },
    { id: 'B4', path: 'App.razor', wrong: '@page "/orders"\n<PkTable></PkTable>', right: '@page "/orders"\n@inherits OrdersPageBase\n<PkTable></PkTable>' },
    { id: 'B5', path: 'App.razor', wrong: 'await JS.InvokeVoidAsync("dialog.showModal", elementRef);', right: 'await dialogRef.ShowAsync();' },
    { id: 'B6', path: 'App.razor', wrong: '<div onclick="go()"></div>', right: '<PkButton OnClick="Go">Go</PkButton>' },
];
