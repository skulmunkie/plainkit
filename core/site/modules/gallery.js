// The Gallery as a module of the site app (#355): the nav is the gallery's whole tree (foundations, the element categories with their elements, samples) as collapsed groups, and ONE
// route ('*', kept alive) mounts the gallery's views inside the app body. The views write their addresses under #/gallery themselves (B() in gallery-views.js), the route's context names
// the current row (the branch opens, the row is marked), and the app owns the bar, the theme, the title and the side nav (the gallery's own nav column is hidden, gallery.css, [data-gx-app]).
// The Elements branch holds 131 rows, over the nav's 40-entry advice: the one deliberate exception, a tree of collapsed groups; the header search still finds an element by name.
import { defineModule } from '../../js/app.js';
import { mountGallery } from '../gallery/gallery.js';
import { ELEMENTS } from '../gallery/gallery.data.js';
import { FOUNDATIONS } from '../gallery/gallery-views.js';

const sample = (kind, title) => ({ id: kind, title, route: `/samples/${kind}` });
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const groups = () => { const by = new Map(); for (const m of ELEMENTS) { const g = m.group || 'Other'; if (!by.has(g)) by.set(g, []); by.get(g).push(m); } return by; };
// the current nav rows for the gallery's own address: the section, the branch under it, the row itself
const rows = ({ path }) => {
    const [sec = 'overview', a] = path.split('/').filter(Boolean);
    if (sec === 'elements' && a) { const g = [...groups()].find(([, ms]) => ms.some(m => m.tag === a)); return { ids: g ? [sec, `g-${slug(g[0])}`, `e-${a}`] : [sec] }; }
    return { ids: sec === 'foundations' && a ? [sec, `f-${a}`] : sec === 'samples' && a ? [sec, a] : [sec] };
};
const mount = (host, ctx) => {
    const css = Object.assign(host.ownerDocument.createElement('link'), { rel: 'stylesheet', href: new URL('../gallery/gallery.css', import.meta.url).href });
    host.ownerDocument.head.append(css);
    // the gallery's sample frames follow the app's theme through the event the old site shell sent
    const stop = ctx.theme.subscribe(name => host.ownerDocument.dispatchEvent(new CustomEvent('site-theme', { detail: name })));
    const shown = mountGallery(host, { chrome: 'full', init: false, base: '/gallery', theme: ctx.theme.name });
    return () => { stop(); shown.then(g => g.destroy()); css.remove(); };
};

export default defineModule({
    id: 'gallery', title: 'Gallery', icon: 'grid',
    nav: () => [
        { id: 'overview', title: 'Overview', route: '/' },
        { id: 'foundations', title: 'Foundations', route: '/foundations', children: FOUNDATIONS.map(([id, title]) => ({ id: `f-${id}`, title, route: `/foundations/${id}` })) },
        { id: 'elements', title: 'Elements', route: '/elements', badge: ELEMENTS.length, children: [...groups()].map(([title, ms]) => ({ id: `g-${slug(title)}`, title, badge: ms.length, children: ms.map(m => ({ id: `e-${m.tag}`, title: m.title, route: `/elements/${m.tag}` })) })) },
        { id: 'samples', title: 'Samples', route: '/samples', children: [sample('templates', 'Templates'), sample('patterns', 'Patterns'), sample('layouts', 'Layouts')] },
    ],
    search: query => {
        const q = query.trim().toLowerCase();
        return q ? ELEMENTS.filter(m => `${m.tag} ${m.title}`.toLowerCase().includes(q)).slice(0, 8).map(m => ({ id: m.tag, label: `<${m.tag}>`, sub: m.title, route: `/elements/${m.tag}` })) : [];
    },
    routes: [{ path: '*', persist: true, context: rows, page: 'custom', config: { mount } }],
});
