// The settings page: theme, gallery text size and sample width, and logging. The gallery reads its two values from the same keys (js/settings.js).
import { defineModule } from '../../js/app.js';
import { readSetting, writeSetting } from '../../js/settings.js';
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
        const scale = select(doc, readSetting('pk-gallery-scale') ?? '1', [['0.9', '90%'], ['1', '100%'], ['1.15', '115%'], ['1.3', '130%']]);
        const width = select(doc, readSetting('pk-gallery-width') === 'phone' ? 'phone' : 'desktop', [['desktop', 'Desktop'], ['phone', 'Phone (375px)']]);
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
        ctx.on(scale, 'pk-value-change', e => writeSetting('pk-gallery-scale', e.detail.value));
        ctx.on(width, 'pk-value-change', e => writeSetting('pk-gallery-width', e.detail.value));
        ctx.on(themes, 'pk-toggle', e => { const name = e.target.closest('pk-button')?.getAttribute('value'); if (name && name !== ctx.theme.name) { ctx.theme.set(name); writeSetting('pk-site-theme', name); } });
        const stop = ctx.theme.subscribe(paint);
        const handle = mountLogSettings(logging, {});
        return () => { stop(); handle?.destroy?.(); };
    } } }],
});
