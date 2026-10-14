// The Gallery as a module of the site app (#355, #1239): the nav is the gallery's whole tree (foundations, the element categories with their elements, samples) as collapsed groups; the routes, the
// frame and the settings are site/gallery/hosted.js (routes naming the gallery's page types, a layout, a store). The Elements branch holds 131 rows, over the nav's 40-entry advice: the one deliberate
// exception, a tree of collapsed groups; the header search still finds an element by name.
import { defineModule } from '../../js/app.js';
import { ELEMENTS } from '../gallery/gallery.data.js';
import { FOUNDATIONS } from '../gallery/gallery-views.js';
import { elementGroups } from '../gallery/runtime.js';
import { hosted } from '../gallery/hosted.js';

const sample = (kind, title) => ({ id: kind, title, route: `/samples/${kind}` });
const branch = g => ({ id: g.id, title: g.title, badge: g.items.length, children: g.items.map(i => ({ id: `e-${i.id}`, title: i.title, route: `/elements/${i.id}` })) });

export default defineModule({
    id: 'gallery', title: 'Gallery', icon: 'grid', navFilter: true, ...hosted,
    nav: () => [
        { id: 'overview', title: 'Overview', route: '/' },
        { id: 'foundations', title: 'Foundations', route: '/foundations', children: FOUNDATIONS.map(([id, title]) => ({ id: `f-${id}`, title, route: `/foundations/${id}` })) },
        { id: 'elements', title: 'Elements', route: '/elements', badge: ELEMENTS.length, children: elementGroups(() => '').map(branch) },
        { id: 'samples', title: 'Samples', route: '/samples', children: [sample('templates', 'Templates'), sample('patterns', 'Patterns'), sample('layouts', 'Layouts')] },
    ],
    search: query => {
        const q = query.trim().toLowerCase();
        return q ? ELEMENTS.filter(m => `${m.tag} ${m.title}`.toLowerCase().includes(q)).slice(0, 8).map(m => ({ id: m.tag, label: `<${m.tag}>`, sub: m.title, route: `/elements/${m.tag}` })) : [];
    },
});
