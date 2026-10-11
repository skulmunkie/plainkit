// The Gallery as a module of the site app (#355, step 4 of the one-app plan): the nav is the gallery's tree at section level, and ONE route ('*', kept alive) mounts the
// existing gallery code unchanged inside the app body. The gallery follows #/gallery/<its own address> (router base '/gallery'); the app owns the bar, the theme, the title and the
// side nav, so the gallery's own nav column is hidden here (gallery.css, [data-gx-app]). 130 elements are too many for the app nav (it advises 40): the Elements row opens the grouped
// overview, and the header search finds one element by name.
import { defineModule } from '../../js/app.js';
import { mountGallery } from '../gallery/gallery.js';
import { ELEMENTS } from '../gallery/gallery.data.js';
import { FOUNDATIONS } from '../gallery/gallery-views.js';

const sample = (kind, title) => ({ id: kind, title, route: `/samples/${kind}` });
// the current nav row for the gallery's own address: its section, and the foundation or sample list under it
const rows = ({ path }) => { const [sec = 'overview', a] = path.split('/').filter(Boolean); return { ids: sec === 'foundations' && a ? [sec, `f-${a}`] : sec === 'samples' && a ? [sec, a] : [sec] }; };
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
        { id: 'elements', title: 'Elements', route: '/elements', badge: ELEMENTS.length },
        { id: 'samples', title: 'Samples', route: '/samples', children: [sample('templates', 'Templates'), sample('patterns', 'Patterns'), sample('layouts', 'Layouts')] },
    ],
    search: query => {
        const q = query.trim().toLowerCase();
        return q ? ELEMENTS.filter(m => `${m.tag} ${m.title}`.toLowerCase().includes(q)).slice(0, 8).map(m => ({ id: m.tag, label: `<${m.tag}>`, sub: m.title, route: `/elements/${m.tag}` })) : [];
    },
    routes: [{ path: '*', persist: true, context: rows, page: 'custom', config: { mount } }],
});
