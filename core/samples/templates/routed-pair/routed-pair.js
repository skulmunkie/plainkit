// A list page and a record page as two routes (#/things, #/things/7, #/things/new): the page types do the work, this file is data and three callbacks.
// Copy it and replace `things` and the callbacks with your API. The route is the only state: a row click and Save only navigate.
import { mountApp, defineModule } from '../../../js/app.js';
import { queryList } from '../../../js/list-query.js';

const STATUS = ['Active', 'Draft', 'Archived'];
let things = Array.from({ length: 60 }, (_, i) => ({ id: String(i + 1), name: `Thing ${i + 1}`, status: STATUS[i % 3] }));

// One record config for both routes: `load` is left out for a new record. Save returns to the list; reject with { errors: { field: message } } to mark a field instead.
const record = (load, title, id) => ({
    heading: 'Details', title, load,
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'status', label: 'Status', type: 'select', options: STATUS }],
    save: async (values, ctx) => {
        things = id ? things.map(r => (r.id === id ? { ...r, ...values } : r)) : [...things, { ...values, id: String(things.length + 1) }];
        ctx.notify?.success('Saved');
        ctx.navigate('/');
    },
});

const thingsModule = defineModule({
    id: 'things', title: 'Things',
    nav: () => [{ id: 'all', title: 'All things', route: '/', icon: 'orders' }],
    routes: [
        // The list page type draws pk-data-table: search, sort, filter and paging come from `load(query)`; rowHref turns a row click into a route change.
        { path: '/', label: 'Things', page: 'list', config: {
            heading: 'Things',
            columns: [{ key: 'name', label: 'Name', sortable: true }, { key: 'status', label: 'Status', sortable: true }],
            filters: [{ key: 'status', type: 'select', label: 'Status', options: STATUS }],
            actions: [{ label: 'New thing', href: '#/things/new', variant: 'primary' }],
            empty: { heading: 'No things yet', description: 'Add one with New thing.' },
            pageSize: 10,
            load: async q => queryList(things, { filter: q.filters?.status ? r => r.status === q.filters.status : null, search: q.search, searchKeys: ['name'], sort: q.sort, sortDir: q.sortDir, page: q.page, pageSize: q.pageSize }),
            rowHref: row => `/${row.id}`,
        }, children: [
            // The record page type: a form with Save, a dirty flag (closing the tab with unsaved edits asks first) and its own loading, not-found and error states.
            { path: '/new', label: 'New thing', page: 'record', config: record(undefined, 'New thing') },
            { path: '/:id', label: p => `Thing ${p.id}`, page: 'record', config: ({ params }) => record(async id => {
                const thing = things.find(r => r.id === id);
                if (!thing) throw new Error(`There is no thing ${id}.`);
                return thing;
            }, `Thing ${params.id}`, params.id) },
        ] },
        { path: '*', page: 'not-found' },
    ],
});

mountApp(document.getElementById('app'), { brand: { text: 'Admin' }, modules: [{ id: 'things', title: 'Things', icon: 'orders', load: async () => ({ default: thingsModule }) }] });
