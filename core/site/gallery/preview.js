// The generic host for a pattern or layout: renders the fragment as a whole page, with no gallery around it.
//   preview.html?kind=patterns|layouts&id=<id>&theme=dark|light&width=desktop|phone
// The gallery frames this same page for its full-page view, and "Open in new page" opens it. kind=templates&id=<id> frames a template page in a
// 375px device (a template is its own page; chrome.js sends ?width=phone here). Framework-free; ES module, no inline script.
import { initPlainkit } from '../../js/plainkit.js';
import { setTheme } from '../../js/theme.js';
import { applyDynamic } from '../../js/dynamic.js';
import { TEMPLATES_DIR, PATTERNS_DIR } from './paths.js';
import { mountPattern } from './pattern-mount.js';
import { on, h, addressOf, replaceAddress } from '../../js/mount-support.js';
import { fillSanitizedHtml } from '../../js/sanitized-html.js';

const doc = document, win = doc.defaultView;
const q = new URL(addressOf(win).href).searchParams;
const kind = q.get('kind');
const id = q.get('id');
const theme = q.get('theme') === 'light' ? 'light' : 'dark';
const phone = q.get('width') === 'phone';
const PHONE_WIDTH = 375;
const root = doc.documentElement;
const host = doc.getElementById('pk-preview');
setTheme(root, theme);

// A message in place of the page: a pk-alert (the element loads on demand).
const say = (message, kind = 'danger') => {
    host.replaceChildren(h(doc, 'pk-alert', { kind, role: 'alert' }, message));
    initPlainkit(doc);
};

// The sample data is the big module of the gallery: the page says it is loading until the fragment can be drawn, and says why when it cannot.
let data;
try { data = await import('./gallery.data.js'); } catch (err) { say(`The preview could not load its data: ${err.message}`); throw err; }
const { PATTERNS, LAYOUTS, TEMPLATES } = data;
const shell = data.ELEMENTS.some(m => m.tag === 'pk-app-shell') ? await data.loadElement('pk-app-shell') : undefined;

const entry = (() => {
    if (kind === 'patterns') { const p = PATTERNS.find(x => x.id === id); return p && { title: p.title, html: p.html, script: p.script }; }
    if (kind === 'layouts') {
        const l = id === 'shell' ? { title: 'App shell', html: shell?.examples[0].html } : LAYOUTS.find(x => x.id === id);
        return l && { title: l.title, html: l.html };
    }
    if (kind === 'templates') { const t = TEMPLATES.find(x => x.id === id); return t && { title: t.title, file: t.file.replace(/^.*?templates[/]/, '') }; }
    return null;
})();

// A page of its own at phone width: the page goes in a real 375px pk-frame, so its media queries see a phone. The framed page is the gallery's
// own (same origin), so the frame is trusted with allow-same-origin; the host fills the window and the frame is centred in it.
function device(src) {
    const frame = h(doc, 'pk-frame', { title: `${entry.title} at phone width`, preset: 'phone', 'allow-same-origin': true, loading: 'eager', height: '100%', src });
    frame.dataset.dyn = `width:${PHONE_WIDTH}px; height:100%; margin-inline:auto`;
    applyDynamic(frame);
    host.replaceChildren(frame);
    initPlainkit(doc);
}

if (!entry) {
    say(`Nothing to preview for "${kind ?? ''}" "${id ?? ''}". Use ?kind=patterns|layouts&id=<id>.`);
} else {
    doc.title = `${entry.title} - Plainkit ${kind}`;
    const wide = win.innerWidth > PHONE_WIDTH + 100 && win.top === win;
    if (kind === 'templates') {
        const url = new URL(TEMPLATES_DIR + entry.file, import.meta.url);
        for (const k of ['nav', 'theme', 'density']) if (q.get(k)) url.searchParams.set(k, q.get(k));
        // Framed at full size (no ?width) the template shows as a page; the frame is the phone when asked for one.
        if (phone && wide) device(url.href); else replaceAddress(win, url.href);
    } else if (phone && wide) {
        const url = new URL(addressOf(win).href);
        url.searchParams.delete('width');
        device(url.href);
    } else {
        // The fragment is the page: a pk-container column, the whole window, the document scrolling itself.
        const page = h(doc, 'pk-stack');
        const column = h(doc, 'pk-container', { size: 'lg' }, page);
        host.replaceChildren(column);
        fillSanitizedHtml(page, entry.html);
        // The demos are not wired to a server: forms do not submit.
        on(doc, 'submit', e => e.preventDefault());
        initPlainkit(doc);
        if (entry.script) await runScript(entry, page);
    }
}

// A pattern's optional script (export default mount(root) -> { destroy() }) makes the sample behave like the real thing. It works on the
// sample's own DOM only, and its listeners are removed when the page goes away.
async function runScript(entry, page) {
    const handle = await mountPattern(page, new URL(PATTERNS_DIR + entry.script, import.meta.url).href, entry.script);
    on(win, 'pagehide', () => handle.destroy(), { once: true });
}
