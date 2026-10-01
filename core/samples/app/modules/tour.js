import { defineModule } from '../../../js/app.js';

const ORDERS = [
    { id: '7', customer: 'Ada Lovelace', status: 'Open', total: 120 },
    { id: '8', customer: 'Grace Hopper', status: 'Shipped', total: 86.5 },
    { id: '9', customer: 'Alan Turing', status: 'Open', total: 240 },
];

// Data pages: the module supplies rows through a load callback. The query (page, sort, search, filters) arrives; the page type draws the table, filters and pager.
const listConfig = {
    heading: 'Orders',
    columns: [{ key: 'id', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status', sortable: true }, { key: 'total', label: 'Total', type: 'number', align: 'end' }],
    filters: [{ key: 'status', type: 'select', label: 'Status', options: ['Open', 'Shipped'] }],
    actions: [{ label: 'New order', href: '#/tour/orders/new', variant: 'primary' }],
    empty: { heading: 'No orders match', description: 'Try another filter.' },
    pageSize: 10,
    load: async query => {
        const rows = ORDERS.filter(o => (!query.filters?.status || o.status === query.filters.status) && `${o.id} ${o.customer}`.toLowerCase().includes((query.search ?? '').toLowerCase()));
        return { rows, total: rows.length };
    },
    rowHref: row => `/orders/${row.id}`,
};

// Form pages: a config of fields plus a save callback that reports through ctx.notify.
const recordConfig = {
    heading: 'Order',
    fields: [{ name: 'customer', label: 'Customer', required: true }, { name: 'status', label: 'Status', type: 'select', options: ['Open', 'Shipped'] }, { name: 'total', label: 'Total', type: 'number' }],
    load: async id => ORDERS.find(o => o.id === id) ?? null,
    save: async (values, ctx) => { ctx.notify?.success('Order saved'); return values; },
};

// Content pages: a document with a table of contents, and a workspace of panes your callback draws into.
const docConfig = {
    items: [{ id: 'start', title: 'Getting started', summary: 'Mount an app.' }],
    href: (id, anchor) => (anchor ? `/guide/${id}?anchor=${anchor}` : `/guide/${id}`),
    loadItem: async () => ({ title: 'Getting started', summary: 'Mount an app.', html: '<h2 id="mount">Mount</h2><p>Call mountApp with a config.</p>' }),
};

export default defineModule({
    id: 'tour', title: 'Tour',
    state: { version: 1, defaults: { pageSize: 10 }, persist: ['pageSize'] },
    nav: () => [
        { id: 'orders', title: 'Orders', route: '/', icon: 'orders' },
        { id: 'overview', title: 'Overview', route: '/overview', icon: 'dashboard' },
        { id: 'tool', title: 'Tool', route: '/tool' },
        { id: 'settings', title: 'Settings', route: '/settings' },
        { id: 'wizard', title: 'Import', route: '/wizard' },
        { id: 'guide', title: 'Guide', route: '/guide' },
        { id: 'workspace', title: 'Workspace', route: '/workspace' },
    ],
    routes: [
        { path: '/', label: 'Orders', page: 'list', config: listConfig, children: [
            { path: '/orders/new', label: 'New order', page: 'record', config: { ...recordConfig, load: undefined }, can: ctx => ctx.auth?.has('orders.write') ?? true },
            { path: '/orders/:id', label: p => `Order ${p.id}`, page: 'record', config: recordConfig },
        ] },
        { path: '/overview', label: 'Overview', page: 'dashboard', config: {
            widgets: [{ key: 'open', label: 'Open orders', kind: 'stat' }, { key: 'revenue', label: 'Revenue', kind: 'stat' }],
            load: async key => ({ value: key === 'open' ? String(ORDERS.filter(o => o.status === 'Open').length) : `$${ORDERS.reduce((sum, o) => sum + o.total, 0)}` }),
        } },
        { path: '/tool', label: 'Tool', page: 'tool', config: {
            input: [{ key: 'amount', type: 'number', label: 'Amount', required: true }],
            outcome: 'stat',
            runLabel: 'Add tax',
            run: async values => ({ value: (Number(values.amount) * 1.2).toFixed(2), label: 'With tax' }),
        } },
        { path: '/settings', label: 'Settings', page: 'settings', config: {
            sections: [{ heading: 'Notifications', fields: [{ key: 'email', type: 'switch', label: 'Email me about new orders' }, { key: 'digest', type: 'select', label: 'Digest', options: ['Daily', 'Weekly'] }] }],
            values: { email: true, digest: 'Daily' },
            save: async (values, ctx) => { ctx.notify?.success('Settings saved'); },
        } },
        { path: '/wizard', label: 'Import', page: 'wizard', config: {
            steps: [
                { id: 'source', label: 'Source', fields: [{ name: 'url', label: 'File address', required: true }] },
                { id: 'options', label: 'Options', fields: [{ name: 'dedupe', label: 'Skip duplicates', type: 'select', options: ['Yes', 'No'] }] },
            ],
            review: true,
            validate: async (stepId, values) => (stepId === 'source' && !/^https?:/.test(values.url ?? '') ? { errors: { url: 'Use an http or https address.' } } : undefined),
            submit: async (values, ctx) => { ctx.notify?.success('Import started'); },
        } },
        { path: '/guide', label: 'Guide', page: 'doc', config: docConfig, children: [{ path: '/guide/:id', label: 'Article', page: 'doc', config: docConfig }] },
        { path: '/workspace', label: 'Workspace', page: 'workspace', config: { panes: ['nav', 'aside'], mount: (panes, ctx) => { panes.main.textContent = `Main pane of ${ctx.id}`; } } },
        { path: '/empty', label: 'Empty', page: 'states', config: { state: 'empty', heading: 'Nothing here yet', description: 'Records you add appear here.' } },
        { path: '*', page: 'not-found' },
    ],
});
