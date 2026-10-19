import { defineModule } from './plainkit/js/app.js';
import { EMAIL, MSG, PAGE_SIZE, ROLES, ROWS } from './rows.js';

// The list page type draws the table, the sortable headers and the pager; load(query) returns one page. The record page type draws the form and shows the errors a save returns.
export default defineModule({
    id: 'team', title: 'Team',
    nav: () => [{ id: 'list', title: 'Team', route: '/' }],
    routes: [
        { path: '/', label: 'Team directory', page: 'list', config: {
            heading: 'Team directory',
            columns: [{ key: 'name', label: 'Name', sortable: true }, { key: 'role', label: 'Role' }, { key: 'score', label: 'Score', type: 'number', sortable: true }],
            actions: [{ label: 'Add member', href: '#/team/members/new', variant: 'primary' }],
            pageSize: PAGE_SIZE,
            selectable: true,
            bulkActions: [{ id: 'delete', label: 'Delete list' }],
            load: async ({ page, pageSize, sort, sortDir }) => {
                const rows = !sort ? ROWS : [...ROWS].sort((a, b) => (sort === 'score' ? a.score - b.score : a.name.localeCompare(b.name)) * (sortDir === 'desc' ? -1 : 1));
                return { rows: rows.slice((page - 1) * pageSize, page * pageSize).map(r => ({ ...r, id: String(r.id) })), total: rows.length };
            },
            onBulk: async (detail, ctx) => { await ctx.dialogs.confirm({ heading: 'Delete the list?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }); },
        }, children: [
            { path: '/members/new', label: 'Add member', page: 'record', config: {
                heading: 'Add member',
                fields: [{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'role', label: 'Role', type: 'select', options: ROLES }],
                save: async values => {
                    const errors = {};
                    if (!values.name?.trim()) errors.name = MSG.name;
                    if (!EMAIL.test(values.email ?? '')) errors.email = MSG.email;
                    if (Object.keys(errors).length) throw { errors };
                    return values;
                },
            } },
        ] },
    ],
});
