// App shell template (#354): mountApp builds the chrome from this config. An overview (dashboard page) and an inbox (master-detail page, /inbox/:id).
import { mountApp, defineModule } from '../../../js/app.js';

const MESSAGES = Array.from({ length: 24 }, (_, i) => ({ id: String(i + 1), subject: `Message ${i + 1}`, from: ['Ada Lovelace', 'Grace Hopper', 'Alan Turing'][i % 3], unread: i % 4 === 0 }));

const overview = defineModule({
    id: 'overview', title: 'Overview',
    nav: () => [{ id: 'home', title: 'Overview', route: '/', icon: 'dashboard' }],
    routes: [
        // Composed from what modules contribute (Inbox).
        { path: '/', label: 'Overview', page: 'dashboard', config: { heading: 'Overview', surface: 'overview' } },
        { path: '*', page: 'not-found' },
    ],
});

// One config serves both routes, so the list stays put when a message opens. The route is the only state; a row click and Back only navigate.
const messages = {
    heading: 'Messages',
    list: { columns: [{ key: 'subject', label: 'Subject' }, { key: 'from', label: 'From' }], pageSize: 10 },
    none: { heading: 'Select a message', description: 'Pick one to read it.' },
    load: async q => {
        const rows = MESSAGES.filter(m => `${m.subject} ${m.from}`.toLowerCase().includes((q.search ?? '').toLowerCase()));
        const size = q.pageSize ?? 10, start = ((q.page ?? 1) - 1) * size;
        return { rows: rows.slice(start, start + size), total: rows.length };
    },
    rowHref: row => `/${row.id}`, listHref: '/',
    mountDetail: async (pane, id) => {
        const m = MESSAGES.find(x => x.id === id);
        if (!m) throw new Error(`There is no message ${id}.`);
        const h = pane.ownerDocument.createElement('pk-heading'), p = pane.ownerDocument.createElement('pk-text');
        h.setAttribute('level', '2'); h.textContent = m.subject; p.textContent = `From ${m.from}.`;
        pane.append(h, p);
        return { destroy() { h.remove(); p.remove(); } };
    },
};

const inbox = defineModule({
    id: 'inbox', title: 'Inbox',
    widgets: {
        total: { load: async () => ({ value: String(MESSAGES.length) }) },
        unread: { load: async () => ({ value: String(MESSAGES.filter(m => m.unread).length) }) },
    },
    nav: () => [{ id: 'messages', title: 'Messages', route: '/', icon: 'orders' }],
    routes: [
        { path: '/', label: 'Messages', page: 'master-detail', config: messages, children: [{ path: '/:id', label: p => `Message ${p.id}`, page: 'master-detail', config: messages }] },
        { path: '*', page: 'not-found' },
    ],
});

mountApp(document.getElementById('app'), { brand: { text: 'My app' }, modules: [
    { id: 'overview', title: 'Overview', icon: 'dashboard', load: async () => ({ default: overview }) },
    { id: 'inbox', title: 'Inbox', icon: 'orders', load: async () => ({ default: inbox }),
      contributes: [{ key: 'total', for: ['overview'], label: 'Messages', kind: 'stat' }, { key: 'unread', for: ['overview'], label: 'Unread', kind: 'stat' }] },
] });
