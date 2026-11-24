// Rendered text contrast (the theme editor's "Audit gallery pages", #107): the contrast of the text a page actually draws, against the colour it actually
// sits on, as the browser computed both. The pure part (rateBoxes, tokensBehind) runs in Node; collectTextBoxes reads a live document, shadow trees included.
// Backgrounds that are an image or a gradient cannot be measured and are skipped, not guessed.
import { parseColour, blend, contrast } from './colour.js';

export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

const rgb = c => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
const parentOf = n => n.parentElement ?? n.getRootNode?.().host ?? null;
const cssPath = el => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = parentOf(n)) parts.unshift(n.localName + (n.id ? `#${n.id}` : '') + [...n.classList].slice(0, 2).map(c => `.${c}`).join(''));
    return parts.join(' > ');
};

// The colour the element sits on: translucent layers are blended down to the first opaque one; null when an image or gradient is in the way or nothing opaque is found.
function backgroundOf(el, win) {
    const layers = [];
    for (let n = el; n; n = parentOf(n)) {
        const cs = win.getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
        const c = parseColour(cs.backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    // Nothing opaque on the way up: the browser's canvas shows through, white unless the page says its colour scheme is dark only.
    const scheme = win.getComputedStyle(el.ownerDocument.documentElement).colorScheme;
    const base = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : /dark/.test(scheme) && !/light/.test(scheme) ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    return layers.reduceRight((under, c) => blend(c, under), base);
}

/** The boxes of text a document draws: [{ selector, text, fg, bg, size, bold }] with fg and bg as rgb() text; hidden, empty and unmeasurable ones are left out. */
export function collectTextBoxes(doc, { limit = 4000 } = {}) {
    const win = doc.defaultView;
    const out = [];
    const walk = root => {
        for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) walk(el.shadowRoot);
            if (out.length >= limit || /^(script|style|svg|option)$/.test(el.localName)) continue;
            const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
            if (!text) continue;
            const cs = win.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (cs.display === 'none' || cs.visibility !== 'visible' || !r.width || !r.height || Number(cs.opacity) === 0) continue;
            const fg = parseColour(cs.color); const bg = backgroundOf(el, win);
            if (!fg || !bg) continue;
            out.push({ selector: cssPath(el), text: text.slice(0, 40), fg: rgb(blend(fg, bg)), bg: rgb(bg), size: parseFloat(cs.fontSize), bold: Number(cs.fontWeight) >= 700 });
        }
    };
    walk(doc);
    return out;
}

/** Boxes below WCAG AA (4.5:1, or 3:1 for large text), grouped by colour pair: [{ fg, bg, ratio, need, count, selector, text }], worst first. */
export function rateBoxes(boxes) {
    const groups = new Map();
    for (const b of boxes) {
        const need = b.size >= 24 || (b.bold && b.size >= 18.66) ? AA_LARGE : AA_TEXT;
        const ratio = contrast(b.fg, b.bg);
        if (ratio === null || ratio >= need) continue;
        const key = `${b.fg}|${b.bg}|${need}`;
        const g = groups.get(key);
        if (g) g.count++; else groups.set(key, { fg: b.fg, bg: b.bg, ratio, need, count: 1, selector: b.selector, text: b.text });
    }
    return [...groups.values()].sort((a, b) => a.ratio - b.ratio);
}

/** The colour tokens whose value is this colour: names in order, each read through valueOf(name) (the resolved value in the page being audited). */
export function tokensBehind(colour, names, valueOf) {
    const want = parseColour(colour);
    if (!want) return [];
    return names.filter(n => { const c = parseColour(valueOf(n)); return c && c.a === 1 && c.r === want.r && c.g === want.g && c.b === want.b; });
}

/**
 * Opens a page off-screen in one theme with the override CSS adopted, settled (its elements defined, then settleMs), and resolves the iframe (the caller removes it).
 * page is { url } (same origin) or { links: [stylesheet URLs], body: html, script?: module URL } for a page of its own. Rejects when the page cannot be styled (another origin).
 */
export function openPageFrame(doc, win, page, { theme, css, settleMs = 600, title = 'page for the audit' }) {
    return new Promise((resolve, reject) => {
        const f = doc.createElement('iframe');
        f.className = 'te-audit-frame'; f.title = title; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
        f.addEventListener('load', () => {
            try {
                const fdoc = f.contentDocument;
                fdoc.documentElement.setAttribute('data-theme', theme);
                const sheet = new f.contentWindow.CSSStyleSheet(); sheet.replaceSync(css);
                fdoc.adoptedStyleSheets = [...fdoc.adoptedStyleSheets, sheet];
            } catch (error) { f.remove(); reject(error); return; }
            const tags = [...new Set([...f.contentDocument.querySelectorAll('*')].map(n => n.localName).filter(n => n.includes('-')))];
            const defined = Promise.all(tags.map(t => f.contentWindow.customElements.whenDefined(t)));
            Promise.race([defined, new Promise(r => win.setTimeout(r, 3000))]).then(() => win.setTimeout(() => resolve(f), settleMs));
        }, { once: true });
        if (page.url) f.src = page.url;
        else f.srcdoc = `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${(page.links ?? []).map(u => `<link rel="stylesheet" href="${encodeURI(u)}">`).join('')}</head><body>${page.body}${page.script ? `<script type="module" src="${encodeURI(page.script)}"></script>` : ''}</body></html>`;
        doc.body.append(f);
    });
}
