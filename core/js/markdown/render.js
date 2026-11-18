// The Markdown AST to DOM nodes, built with createElement/createTextNode/setAttribute only: no string-to-HTML sink, nothing from the source becomes
// an attribute except a vetted link address. Consumers render stored Markdown through renderMarkdown, never by writing the text into markup.
import { parseMarkdown, safeMdUrl, safeImgUrl, plain } from './parse.js';

/** The longest source the preview renders; more is cut and a note is added. */
export const MAX_PREVIEW = 200_000;
const BLOCK = { p: 'p', q: 'blockquote' };

/** GitHub-style heading slug: lower case, letters, digits, _ and -, spaces to hyphens. */
const slug = s => s.toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';

/**
 * An AST to a DocumentFragment owned by `doc`. Options: `ids` gives each heading a slug id; `resolve(url, kind)` ('link' | 'image') returns the address to use
 * (null drops it); a result is checked again, so a hook cannot produce an unsafe address. An in-page #anchor is not passed to it.
 */
export function renderAst(ast, doc = document, opts = {}) {
    const used = new Set();
    const fix = (u, kind) => { const r = u.startsWith('#') || !opts.resolve ? u : opts.resolve(u, kind); return typeof r === 'string' && (kind === 'image' ? safeImgUrl(r) : safeMdUrl(r)) ? r : null; };
    const heading = b => {
        const h = el('h' + b.n, inl(b.c));
        if (opts.ids) {
            const base = slug(plain(b.c));
            let id = base;
            for (let k = 1; used.has(id); k++) id = base + '-' + k;
            used.add(id); h.setAttribute('id', id);
        }
        return h;
    };
    const el = (tag, kids) => { const e = doc.createElement(tag); for (const k of kids) e.appendChild(k); return e; };
    const inl = nodes => nodes.map(n => {
        if (n.t === 'text') return doc.createTextNode(n.v);
        if (n.t === 'code') return el('code', [doc.createTextNode(n.v)]);
        if (n.t === 'a') {
            const href = safeMdUrl(n.href) ? fix(n.href, 'link') : null;
            if (href === null) return el('span', inl(n.c));
            const a = el('a', inl(n.c));
            a.setAttribute('href', href); a.setAttribute('rel', 'noopener noreferrer');
            return a;
        }
        if (n.t === 'img') {
            const src = fix(n.src, 'image');
            if (src === null) return doc.createTextNode(n.alt);
            const i = el('img', []);
            i.setAttribute('alt', n.alt); i.setAttribute('src', src); i.setAttribute('loading', 'lazy');
            return i;
        }
        return el(n.t === 'b' ? 'strong' : 'em', inl(n.c));
    });
    const list = l => el(l.t, l.items.map(it => el('li', [...inl(it.c), ...(it.sub ? [list(it.sub)] : [])])));
    const blocks = bs => bs.map(b => {
        if (b.t === 'h') return heading(b);
        if (b.t === 'table') {
            const row = (cs, tag) => el('tr', cs.map((c, k) => { const d = el(tag, inl(c)); if (b.align[k]) d.setAttribute('class', 'pk-md-' + b.align[k]); return d; }));
            const wrap = el('div', [el('table', [el('thead', [row(b.head, 'th')]), el('tbody', b.rows.map(r => row(r, 'td')))])]);
            wrap.setAttribute('class', 'pk-md-table'); wrap.setAttribute('tabindex', '0');
            return wrap;
        }
        if (b.t === 'code') { const code = el('code', [doc.createTextNode(b.v)]); if (/^[\w+-]+$/.test(b.lang)) code.setAttribute('class', 'language-' + b.lang); return el('pre', [code]); }
        if (b.t === 'ul' || b.t === 'ol') return list(b);
        return el(BLOCK[b.t], b.t === 'q' ? blocks(b.c) : inl(b.c));
    });
    const frag = doc.createDocumentFragment();
    for (const n of blocks(ast.c)) frag.appendChild(n);
    return frag;
}

/** Markdown text to a DocumentFragment, safe for untrusted input (see the hostile corpus test). */
export function renderMarkdown(text, doc = document, opts = {}) {
    const s = String(text ?? '');
    const frag = renderAst(parseMarkdown(s.length > MAX_PREVIEW ? s.slice(0, MAX_PREVIEW) : s), doc, opts);
    if (s.length > MAX_PREVIEW) {
        const p = doc.createElement('p');
        p.setAttribute('class', 'pk-md-truncated');
        p.appendChild(doc.createTextNode('Preview shortened: the text is longer than ' + MAX_PREVIEW + ' characters.'));
        frag.appendChild(p);
    }
    return frag;
}
