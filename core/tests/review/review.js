// The UI review page: renders every gallery example of one element and measures it. Driven by scripts/ui-review.mjs, which opens
//   /tests/review/?tag=pk-page-header&theme=light
// in a headless browser at a chosen viewport, waits for window.__review.ready, reads window.__review = { examples: [{ title, rect, facts }] } and
// screenshots each rect. The rules that judge the facts are in audit.js (pure, tested in Node).
import { loadElement } from '../../site/gallery/gallery.data.js';
import { loadElements } from '../../js/loader.js';
import { applyDynamic } from '../../js/dynamic.js';
import { createLogger } from '../../js/log.js';

const log = createLogger('review');
const params = new URLSearchParams(location.search);
const tag = params.get('tag') ?? '';
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
const registry = new URL('../../elements/registry.js', import.meta.url).href;
const root = document.getElementById('rv-root');
const state = { ready: false, error: null, tag, examples: [] };
window.__review = state;

const hop = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const settle = async () => { await hop(); await hop(); await document.fonts?.ready; await new Promise(r => setTimeout(r, 120)); };

const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
canvas.canvas.width = canvas.canvas.height = 1;
// Any CSS colour (rgb, oklch, color-mix results) to [r, g, b, a] by painting one pixel.
function rgba(css) {
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = '#000';
    canvas.fillStyle = css;
    canvas.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
}
const flatParent = n => n.assignedSlot ?? n.parentElement ?? n.getRootNode()?.host ?? null;

// The opaque colour behind an element: its ancestors' backgrounds laid over each other; null when a gradient or image is in the way.
function backdrop(el) {
    const layers = [];
    for (let n = el; n; n = flatParent(n)) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') return null;
        const c = rgba(cs.backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] === 1) break;
    }
    let base = layers.length && layers[layers.length - 1][3] === 1 ? layers.pop().slice(0, 3) : null;
    if (!base) return null;
    while (layers.length) { const [r, g, b, a] = layers.pop(); base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)]; }
    return base;
}

const ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'switch', 'checkbox', 'radio', 'option', 'combobox', 'textbox', 'slider']);
const isInteractive = el => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.inert) return false;
    const n = el.localName;
    if (n === 'a') return el.hasAttribute('href');
    if (n === 'input') return el.type !== 'hidden';
    if (['button', 'select', 'textarea', 'summary'].includes(n)) return true;
    const t = el.getAttribute('tabindex');
    return (t !== null && Number(t) >= 0) || ROLES.has(el.getAttribute('role')) || el.isContentEditable;
};

const textOf = el => {
    let s = '';
    const walk = n => {
        if (n.nodeType === 3) s += n.textContent;
        else if (n.nodeType === 1) {
            if (n.localName === 'slot') { for (const a of n.assignedNodes({ flatten: true })) walk(a); }
            else { const alt = n.getAttribute('aria-label') ?? (n.localName === 'img' ? n.getAttribute('alt') : null); if (alt) s += alt; else { if (n.shadowRoot) for (const c of n.shadowRoot.childNodes) walk(c); else for (const c of n.childNodes) walk(c); } }
        }
    };
    for (const c of el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes) walk(c);
    return s.trim();
};
function nameOf(el) {
    for (let n = el; n; n = n.getRootNode()?.host ?? null) {
        const direct = n.getAttribute('aria-label') || n.getAttribute('title') || n.getAttribute('alt');
        if (direct?.trim()) return direct.trim();
        const by = n.getAttribute('aria-labelledby');
        if (by) { const t = by.split(/\s+/).map(id => n.getRootNode().getElementById?.(id)?.textContent ?? '').join(' ').trim(); if (t) return t; }
        if (n.labels?.length) { const t = [...n.labels].map(l => l.textContent).join(' ').trim(); if (t) return t; }
        if (n.value && ['submit', 'button', 'reset'].includes(n.type)) return String(n.value);
        const t = textOf(n);
        if (t) return t;
        if (n.placeholder) return n.placeholder;
    }
    return '';
}

const pathOf = (el, top) => {
    const parts = [];
    for (let n = el; n && n !== top; n = n.parentElement ?? n.getRootNode()?.host ?? null) {
        const sibs = n.parentElement ? [...n.parentElement.children].filter(c => c.localName === n.localName) : [n];
        parts.push(n.localName + (sibs.length > 1 ? `[${sibs.indexOf(n) + 1}]` : ''));
    }
    return parts.reverse().join(' > ') || el.localName;
};

function* flat(node) {
    for (const c of node.children) { yield c; if (c.shadowRoot) yield* flat(c.shadowRoot); yield* flat(c); }
}

function measure(stage) {
    const ids = new Map();
    const boxes = [];
    const ox = scrollX, oy = scrollY;
    for (const el of flat(stage)) {
        if (['script', 'style', 'template', 'slot', 'defs', 'title', 'path'].includes(el.localName)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'contents' || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue; // no box, or hidden by an ancestor (a closed dialog)
        const r = el.getBoundingClientRect();
        const media = ['img', 'svg', 'canvas', 'video', 'pk-icon'].includes(el.localName);
        if (!media && !el.getClientRects().length) continue;
        const inter = isInteractive(el);
        let parent = 0;
        for (let p = flatParent(el); p; p = flatParent(p)) if (ids.has(p)) { parent = ids.get(p); break; }
        const id = boxes.length + 1;
        ids.set(el, id);
        const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        const pseudo = [];
        if (inter || el.closest?.('a') || el.getAttribute('role') === 'link') for (const which of ['before', 'after']) { const p = getComputedStyle(el, `::${which}`); pseudo.push({ which, content: p.content, pointerEvents: p.pointerEvents }); }
        const clampedLines = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
        const clipX = ['hidden', 'clip'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && cs.textOverflow !== 'ellipsis';
        const clipY = ['hidden', 'clip'].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0 && !clampedLines && cs.textOverflow !== 'ellipsis';
        const bg = ownText && !el.disabled ? backdrop(el) : null;
        boxes.push({
            id, parent, path: pathOf(el, stage), rect: [r.x + ox, r.y + oy, r.width, r.height].map(v => Math.round(v * 10) / 10),
            inFlow: !['absolute', 'fixed'].includes(cs.position) && cs.float === 'none' && !el.hasAttribute('popover'),
            clipX, clipY, interactive: inter, inlineLink: el.localName === 'a' && cs.display === 'inline', name: inter ? nameOf(el) : '',
            textColor: ownText && bg && Number(cs.opacity) === 1 ? rgba(cs.color) : null, bg, fontSize: parseFloat(cs.fontSize), bold: Number(cs.fontWeight) >= 700,
            media, inLink: Boolean(el.closest?.('a')) || el.getAttribute('role') === 'link', pseudo,
        });
    }
    return boxes;
}

try {
    const meta = await loadElement(tag);
    for (const [i, ex] of (meta.examples ?? []).entries()) {
        const title = document.createElement('p');
        title.className = 'rv-title';
        title.textContent = `${i + 1}. ${ex.title}`;
        const stage = document.createElement('div');
        stage.className = 'rv-stage';
        stage.dataset.example = String(i);
        stage.append(...new DOMParser().parseFromString(`<body>${ex.html}`, 'text/html').body.childNodes);
        root.append(title, stage);
        applyDynamic(stage);
        await loadElements(stage, { registry });
        await Promise.all([...new Set([...stage.querySelectorAll('*')].map(e => e.localName).filter(n => n.includes('-')))].map(n => customElements.whenDefined(n).catch(e => log.warn(`${n} never defined`, e))));
        await settle();
    }
    await settle();
    const touchTarget = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--touch-target')) || undefined;
    for (const stage of root.querySelectorAll('.rv-stage')) {
        const r = stage.getBoundingClientRect();
        state.examples.push({
            title: meta.examples[Number(stage.dataset.example)].title,
            rect: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height },
            facts: { viewport: { width: innerWidth }, touchTarget, docScrollWidth: document.documentElement.scrollWidth, exampleWidth: Math.round(r.width), boxes: measure(stage) },
        });
    }
} catch (error) {
    log.error(`could not review ${tag}`, error);
    state.error = String(error?.message ?? error);
}
state.ready = true;
