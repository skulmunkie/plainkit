// The Settings page's body: theme, the Gallery's text size and sample width (its store, state.js) and logging. Mounted by the site app's Settings module (site/modules/settings.js).
import { h } from './mount-support.js';
import { galleryStore } from './state.js';
import { createLogger } from '../../js/log.js';

const log = createLogger('gallery-settings');

const select = (doc, value, list) => h(doc, 'pk-select', { value }, ...list.map(([v, t]) => h(doc, 'option', { value: v }, t)));

export function mountSettings(host, ctx) {
    const doc = host.ownerDocument;
    const themes = h(doc, 'pk-button-group', { label: 'Theme', mode: 'single' }, ...['dark', 'light'].map(n => h(doc, 'pk-button', { toggle: true, variant: 'ghost', value: n }, n === 'dark' ? 'Dark' : 'Light')));
    const gallery = galleryStore(); // the Gallery module's two display settings: its namespace is free while this module is on show
    const scale = select(doc, String(gallery.get('scale')), [['0.9', '90%'], ['1', '100%'], ['1.15', '115%'], ['1.3', '130%']]);
    const width = select(doc, gallery.get('width'), [['desktop', 'Desktop'], ['phone', 'Phone (375px)']]);
    const logging = h(doc, 'div');
    const paint = () => themes.querySelectorAll('pk-button').forEach(b => b.toggleAttribute('pressed', b.getAttribute('value') === ctx.theme.name));
    host.append(h(doc, 'pk-stack', {},
        h(doc, 'pk-page-header', { heading: 'Settings', level: '1' }, h(doc, 'pk-text', { inline: true, tone: 'muted', slot: 'meta' }, 'Preferences for this browser. They are kept in local storage and apply to every page of the site and to the gallery.')),
        h(doc, 'pk-card', { heading: 'Theme' }, themes),
        h(doc, 'pk-card', { heading: 'Gallery' }, h(doc, 'pk-stack', { gap: 'sm' },
            h(doc, 'pk-field', { label: 'Text size in samples' }, scale), h(doc, 'pk-field', { label: 'Sample width' }, width))),
        h(doc, 'pk-card', { heading: 'Logging' }, h(doc, 'pk-stack', { gap: 'sm' },
            h(doc, 'pk-text', { inline: true, tone: 'muted' }, 'What the SDK and your code log through createLogger: the level, a level per scope and where each level goes. Saved in this browser. The ?pk-log= address parameter and <html data-pk-log> still choose the level when a page loads.'), logging))));
    paint();
    for (const [el, key, as] of [[scale, 'scale', Number], [width, 'width', String]]) ctx.on(el, 'pk-value-change', e => gallery.set(key, as(e.detail.value)));
    ctx.on(themes, 'pk-toggle', e => { const name = e.target.closest('pk-button')?.getAttribute('value'); if (name && name !== ctx.theme.name) ctx.theme.set(name); }); // the app keeps the theme
    const stop = ctx.theme.subscribe(paint);
    // modules/log-settings belongs to the tools package: loaded here, so a gallery without tools shows a notice in its place.
    let handle = null, gone = false;
    import('../../modules/log-settings/log-settings.js').then(m => { if (!gone) handle = m.mountLogSettings(logging, {}); }, err => {
        log.warn('The logging settings could not load; add the tools option to enable them.', err);
        logging.textContent = 'Add the tools option to enable the logging settings.';
    });
    return () => { gone = true; stop(); handle?.destroy?.(); gallery.destroy(); };
}
