// The Guides as a module of the site app (#355, step 3 of the one-app plan): the same content (guides.data.js, made at build time from site/guides/content/*.md)
// and the same body-word search (guides-search.js) as the standalone page, shown by the app's 'doc' page type. The whole module, data included, is one lazy chunk.
// Addresses: #/guides (the list), #/guides/<id> (a guide), #/guides/<id>?anchor=<heading> (a place in it).
import { defineModule } from '../../js/app.js';
import { GUIDES } from '../guides/guides.data.js';
import { searchGuides } from '../guides/guides-search.js';

const find = id => GUIDES.find(g => g.id === id);
const search = query => {
    const results = searchGuides(GUIDES, query);
    const titled = results.filter(r => r.titleMatch).map(r => r.guide.title), mentioned = results.filter(r => !r.titleMatch && r.bodyMatch).map(r => r.guide.title);
    return {
        ids: results.map(r => r.guide.id),
        status: results.length
            ? [titled.length && `${titled.length} guide${titled.length === 1 ? '' : 's'} titled “${query.trim()}”: ${titled.join(', ')}`, mentioned.length && `mentioned in ${mentioned.join(', ')}`].filter(Boolean).join('; ')
            : `No guides match “${query.trim()}”.`,
    };
};
const doc = {
    items: GUIDES.map(({ id, title, summary }) => ({ id, title, summary })), search: true, breadcrumb: true, navLabel: 'Guides', pagerLabel: 'Guide navigation', searchLabel: 'Search guides',
    home: { title: 'Guides', summary: 'Getting started, theming and logging, written from what the repository does today.', cards: true },
    loadItem: id => { const g = find(id); return g ? { title: g.title, summary: g.summary, html: g.html } : null; },
    href: (id, anchor) => (id == null ? '/' : `/${id}${anchor ? `?anchor=${encodeURIComponent(anchor)}` : ''}`),
    searchItems: search,
};

export default defineModule({
    id: 'guides', title: 'Guides', icon: 'docs',
    routes: [{ path: '/', page: { type: 'doc', config: doc }, label: 'Guides', children: [{ path: '/:id', page: { type: 'doc', config: doc }, label: p => find(p.id)?.title ?? 'Guide not found' }] }],
});
