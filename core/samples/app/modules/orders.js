import { defineModule } from '../../../js/app.js';
import { table, facts, note } from './page.js';

const ORDERS = [
    { id: '7', customer: 'Ada Lovelace', status: 'Open', total: '$120.00' },
    { id: '8', customer: 'Grace Hopper', status: 'Shipped', total: '$86.50' },
    { id: '9', customer: 'Alan Turing', status: 'Open', total: '$240.00' },
    { id: '10', customer: 'Edsger Dijkstra', status: 'Shipped', total: '$64.00' },
];
const COLUMNS = [{ key: 'id', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status' }, { key: 'total', label: 'Total', type: 'number' }];
const list = (heading, rows) => ({ mount: table(heading, COLUMNS, rows) });
const record = id => {
    const o = ORDERS.find(x => x.id === id);
    return { mount: o ? facts(`Order ${o.id}`, [['Customer', o.customer], ['Status', o.status], ['Total', o.total]]) : note('Order not found', `There is no order ${id}.`) };
};

// The nav is structure: three destinations. The orders themselves are the rows of a list page, and an order is a record route under the list, so the list's entry stays
// current while an order is open and the breadcrumbs read Demo app > Orders > Order 8.
export default defineModule({
    id: 'orders', title: 'Orders',
    nav: () => [{ id: 'all', title: 'All orders', route: '/', icon: 'orders' }, { id: 'open', title: 'Open', route: '/open' }, { id: 'shipped', title: 'Shipped', route: '/shipped' }],
    // The header search asks the active module: here it finds records (a module without `search` is searched through its nav).
    search: query => ORDERS.filter(o => `order ${o.id} ${o.customer}`.toLowerCase().includes(query.trim().toLowerCase())).map(o => ({ id: o.id, label: `Order ${o.id}`, sub: o.customer, route: `/${o.id}` })),
    routes: [
        { path: '/', label: 'All orders', page: 'custom', config: list('All orders', ORDERS), children: [{ path: '/:id', label: p => `Order ${p.id}`, page: 'custom', config: ({ params }) => record(params.id) }] },
        { path: '/open', label: 'Open', page: 'custom', config: list('Open orders', ORDERS.filter(o => o.status === 'Open')) },
        { path: '/shipped', label: 'Shipped', page: 'custom', config: list('Shipped orders', ORDERS.filter(o => o.status === 'Shipped')) },
        { path: '*', page: 'not-found' },
    ],
});
