// The generic host for a pattern or layout: renders the fragment as a whole page, with no gallery around it.
//   preview.html?kind=patterns|layouts&id=<id>&theme=dark|light&width=desktop|phone
// The gallery frames this same page for its full-page view, and "Open in new page" opens it. kind=templates&id=<id> frames a template page in a
// 375px device (a template is its own page; chrome.js sends ?width=phone here). Framework-free; ES module, no inline script.
import { initPlainkit } from '../js/plainkit.js';
import { setTheme } from '../js/theme.js';
import { createLogger } from '../js/log.js';
import { TEMPLATES_DIR, PATTERNS_DIR } from './paths.js';

const log = createLogger('gallery-preview');

const q = new URLSearchParams(location.search);
const kind = q.get('kind');
const id = q.get('id');
const theme = q.get('theme') === 'light' ? 'light' : 'dark';
const phone = q.get('width') === 'phone';
const PHONE_WIDTH = 375;
const root = document.documentElement;
const host = document.getElementById('pk-preview');
setTheme(root, theme);

// A message in place of the page: a pk-alert (the element loads on demand).
const say = (message, kind = 'danger') => {
    const alert = document.createElement('pk-alert');
    alert.setAttribute('kind', kind);
    alert.setAttribute('role', 'alert');
    alert.textContent = message;
    host.replaceChildren(alert);
    initPlainkit(document);
};

// The sample data is the big module of the gallery: the page says it is loading until the fragment can be drawn, and says why when it cannot.
let data;
try { data = await import('./gallery.data.js'); } catch (err) { say(`The preview could not load its data: ${err.message}`); throw err; }
const { PATTERNS, LAYOUTS, ELEMENTS, TEMPLATES } = data;

const entry = (() => {
    if (kind === 'patterns') { const p = PATTERNS.find(x => x.id === id); return p && { title: p.title, html: p.html, script: p.script }; }
    if (kind === 'layouts') {
        const l = id === 'shell' ? { title: 'App shell', html: ELEMENTS.find(m => m.tag === 'pk-app-shell')?.examples[0].html } : LAYOUTS.find(x => x.id === id);
        return l && { title: l.title, html: l.html };
    }
    if (kind === 'templates') { const t = TEMPLATES.find(x => x.id === id); return t && { title: t.title, file: t.file.replace(/^.*?templates[/]/, '') }; }
    return null;
})();

// A page of its own at phone width: the page goes in a real 375px frame, so its media queries see a phone.
function device(src) {
    document.body.classList.add('pv-host');
    const frame = document.createElement('iframe');
    frame.className = 'pv-device';
    frame.title = `${entry.title} at phone width`;
    frame.style.width = `${PHONE_WIDTH}px`;
    frame.src = src;
    host.replaceChildren(frame);
}

if (!entry) {
    say(`Nothing to preview for "${kind ?? ''}" "${id ?? ''}". Use ?kind=patterns|layouts&id=<id>.`);
} else {
    document.title = `${entry.title} - Plainkit ${kind}`;
    const wide = innerWidth > PHONE_WIDTH + 100 && window.top === window;
    if (kind === 'templates') {
        const url = new URL(TEMPLATES_DIR + entry.file, import.meta.url);
        for (const k of ['nav', 'theme', 'density']) if (q.get(k)) url.searchParams.set(k, q.get(k));
        // Framed at full size (no ?width) the template shows as a page; the frame is the phone when asked for one.
        if (phone && wide) device(url.href); else location.replace(url.href);
    } else if (phone && wide) {
        const url = new URL(location.href);
        url.searchParams.delete('width');
        device(url.href);
    } else {
        // The fragment is the page: a page-width column with the SDK's own page gutter, the whole window, the document scrolling itself.
        document.body.classList.add('pv-body');
        const page = document.createElement('pk-stack');
        page.className = 'pv-page';
        host.replaceChildren(page);
        page.innerHTML = entry.html;
        // The demos are not wired to a server: forms do not submit.
        document.addEventListener('submit', e => e.preventDefault());
        initPlainkit(document);
        if (entry.script) await runScript(entry, page);
    }
}

// A pattern's optional script (export default mount(root) -> { destroy() }) makes the sample behave like the real thing. It works on the
// sample's own DOM only, and its listeners are removed when the page goes away.
async function runScript(entry, page) {
    const url = new URL(PATTERNS_DIR + entry.script, import.meta.url).href;
    try {
        const mount = (await import(url)).default;
        if (typeof mount !== 'function') { log.error(`${entry.script} has no default export to mount`, { url }); return; }
        const handle = mount(page);
        addEventListener('pagehide', () => handle?.destroy?.(), { once: true });
        log.debug(`${entry.script} mounted`, { url });
    } catch (error) { log.error(`the sample script ${entry.script} failed`, error); }
}
