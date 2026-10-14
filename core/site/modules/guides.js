// The Guides as a module of the site app (#355, step 3 of the one-app plan): the same content (guides.data.js, made at build time from site/guides/content/*.md)
// and the same body-word search (guides-search.js) as the standalone page, shown by the app's 'doc' page type. The whole module, data included, is one lazy chunk.
// Addresses: #/guides (the list), #/guides/<id> (a guide), #/guides/<id>?anchor=<heading> (a place in it).
import { defineModule } from '../../js/app.js';
import { GUIDES } from '../guides/guides.data.js';
import { guideSearch, searchGuides } from '../guides/guides-search.js';

const find = id => GUIDES.find(g => g.id === id);
const doc = {
    items: GUIDES.map(({ id, title, summary }) => ({ id, title, summary })), search: true, embedded: true, navLabel: 'Guides', pagerLabel: 'Guide navigation', searchLabel: 'Search guides',
    home: { title: 'Guides', summary: 'Getting started, theming and logging, written from what the repository does today.', cards: true },
    loadItem: (id, ctx) => { const g = find(id); if (!g) { ctx.log.warn(`no guide named "${id}"`, { known: GUIDES.map(x => x.id) }); return null; } return { title: g.title, summary: g.summary, html: g.html }; }, // an unknown guide is a not-found page and a logged warning
    href: (id, anchor) => (id == null ? '/' : `/${id}${anchor ? `?anchor=${encodeURIComponent(anchor)}` : ''}`),
    searchItems: query => guideSearch(GUIDES, query),
};

export default defineModule({
    id: 'guides', title: 'Guides', icon: 'docs',
    nav: () => GUIDES.map(g => ({ id: g.id, title: g.title, route: `/${g.id}` })),
    // the header search (#355): the same body-word matcher, one result per guide, picking one opens it
    search: query => searchGuides(GUIDES, query).slice(0, 8).map(r => ({ id: r.guide.id, label: r.guide.title, sub: r.titleMatch ? 'Title' : 'Mentioned in the text', route: `/${r.guide.id}` })),
    routes: [{ path: '/', page: { type: 'doc', config: doc } }, { path: '/:id', page: { type: 'doc', config: doc }, label: p => find(p.id)?.title ?? 'Guide not found' }],
});
