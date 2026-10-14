// The settings page: theme, gallery text size and sample width, and logging. The two gallery values are the Gallery module's store keys (site/gallery/state.js).
import { defineModule } from '../../js/app.js';
import { galleryStore } from '../gallery/state.js';
import { mountLogSettings } from '../../modules/log-settings/log-settings.js';

const make = (doc, tag, attrs = {}, ...kids) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.append(...kids);
    return el;
};
const select = (doc, value, list) => make(doc, 'pk-select', { value }, ...list.map(([v, t]) => make(doc, 'option', { value: v }, t)));

export default defineModule({
    id: 'settings', title: 'Settings',
    routes: [{ path: '*', page: 'custom', config: { mount(host, ctx) {
        const doc = host.ownerDocument;
        const themes = make(doc, 'pk-button-group', { label: 'Theme', mode: 'single' }, ...['dark', 'light'].map(n => make(doc, 'pk-button', { toggle: '', variant: 'ghost', value: n }, n === 'dark' ? 'Dark' : 'Light')));
        const gallery = galleryStore(); // the Gallery module's two display settings: its namespace is free while this module is on show
        const scale = select(doc, String(gallery.get('scale')), [['0.9', '90%'], ['1', '100%'], ['1.15', '115%'], ['1.3', '130%']]);
        const width = select(doc, gallery.get('width'), [['desktop', 'Desktop'], ['phone', 'Phone (375px)']]);
        const logging = make(doc, 'div');
        const paint = () => themes.querySelectorAll('pk-button').forEach(b => b.toggleAttribute('pressed', b.getAttribute('value') === ctx.theme.name));
        host.append(make(doc, 'pk-stack', {},
            make(doc, 'pk-page-header', { heading: 'Settings', level: '1' }, make(doc, 'pk-text', { inline: '', tone: 'muted', slot: 'meta' }, 'Preferences for this browser. They are kept in local storage and apply to every page of the site and to the gallery.')),
            make(doc, 'pk-card', { heading: 'Theme' }, themes),
            make(doc, 'pk-card', { heading: 'Gallery' }, make(doc, 'pk-stack', { gap: 'sm' },
                make(doc, 'pk-field', { label: 'Text size in samples' }, scale), make(doc, 'pk-field', { label: 'Sample width' }, width))),
            make(doc, 'pk-card', { heading: 'Logging' }, make(doc, 'pk-stack', { gap: 'sm' },
                make(doc, 'pk-text', { inline: '', tone: 'muted' }, 'What the SDK and your code log through createLogger: the level, a level per scope and where each level goes. Saved in this browser. The ?pk-log= address parameter and <html data-pk-log> still choose the level when a page loads.'), logging))));
        paint();
        for (const [el, key, as] of [[scale, 'scale', Number], [width, 'width', String]]) ctx.on(el, 'pk-value-change', e => gallery.set(key, as(e.detail.value)));
        ctx.on(themes, 'pk-toggle', e => { const name = e.target.closest('pk-button')?.getAttribute('value'); if (name && name !== ctx.theme.name) ctx.theme.set(name); }); // the app keeps the theme
        const stop = ctx.theme.subscribe(paint);
        const handle = mountLogSettings(logging, {});
        return () => { stop(); handle?.destroy?.(); gallery.destroy(); };
    } } }],
});
