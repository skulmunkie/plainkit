import { defineModule } from '../../../js/app.js';

const ORDERS = [
    { id: '7', customer: 'Ada Lovelace', status: 'Open', total: '$120.00' },
    { id: '8', customer: 'Grace Hopper', status: 'Shipped', total: '$86.50' },
    { id: '9', customer: 'Alan Turing', status: 'Open', total: '$240.00' },
    { id: '10', customer: 'Edsger Dijkstra', status: 'Shipped', total: '$64.00' },
];
const COLUMNS = [{ key: 'id', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status' }, { key: 'total', label: 'Total', type: 'number' }];
const FIELDS = [{ name: 'customer', label: 'Customer' }, { name: 'status', label: 'Status' }, { name: 'total', label: 'Total' }];

// A list page: the built-in type draws the table, filters and pager from `load`; a status filter narrows the "All orders" list into the Open and
// Shipped routes with no separate config of their own.
const listFor = status => ({
    heading: status ? `${status} orders` : 'All orders',
    columns: COLUMNS,
    empty: { heading: 'No orders', description: status ? `No ${status.toLowerCase()} orders.` : 'There are no orders yet.' },
    load: async () => {
        const rows = status ? ORDERS.filter(o => o.status === status) : ORDERS;
        return { rows, total: rows.length };
    },
    rowHref: row => `/${row.id}`,
});

// A record page: `load` rejects for an id that does not exist, and the built-in type shows its own error state (with Retry) instead of a blank form.
const recordConfig = {
    heading: 'Order',
    fields: FIELDS,
    editable: false,
    load: async id => {
        const o = ORDERS.find(x => x.id === id);
        if (!o) throw new Error(`There is no order ${id}.`);
        return o;
    },
};

// The nav is structure: three destinations. The orders themselves are the rows of a list page, and an order is a record route under the list, so the list's entry stays
// current while an order is open and the breadcrumbs read Demo app > Orders > Order 8.
export default defineModule({
    id: 'orders', title: 'Orders',
    nav: () => [{ id: 'all', title: 'All orders', route: '/', icon: 'orders' }, { id: 'open', title: 'Open', route: '/open' }, { id: 'shipped', title: 'Shipped', route: '/shipped' }],
    // The header search asks the active module: here it finds records (a module without `search` is searched through its nav).
    search: query => ORDERS.filter(o => `order ${o.id} ${o.customer}`.toLowerCase().includes(query.trim().toLowerCase())).map(o => ({ id: o.id, label: `Order ${o.id}`, sub: o.customer, route: `/${o.id}` })),
    routes: [
        { path: '/', label: 'All orders', page: 'list', config: listFor(null), children: [{ path: '/:id', label: p => `Order ${p.id}`, page: 'record', config: recordConfig }] },
        { path: '/open', label: 'Open', page: 'list', config: listFor('Open') },
        { path: '/shipped', label: 'Shipped', page: 'list', config: listFor('Shipped') },
        { path: '*', page: 'not-found' },
    ],
});
