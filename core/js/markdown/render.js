// The Markdown AST to DOM nodes, built with createElement/createTextNode/setAttribute only: no string-to-HTML sink, nothing from the source becomes
// an attribute except a vetted link address. Consumers render stored Markdown through renderMarkdown, never by writing the text into markup.
import { parseMarkdown, safeMdUrl } from './parse.js';

/** The longest source the preview renders; more is cut and a note is added. */
export const MAX_PREVIEW = 200_000;
const BLOCK = { p: 'p', q: 'blockquote' };

/** An AST to a DocumentFragment owned by `doc`. */
export function renderAst(ast, doc = document) {
    const el = (tag, kids) => { const e = doc.createElement(tag); for (const k of kids) e.appendChild(k); return e; };
    const inl = nodes => nodes.map(n => {
        if (n.t === 'text') return doc.createTextNode(n.v);
        if (n.t === 'code') return el('code', [doc.createTextNode(n.v)]);
        if (n.t === 'a') {
            if (!safeMdUrl(n.href)) return el('span', inl(n.c));
            const a = el('a', inl(n.c));
            a.setAttribute('href', n.href); a.setAttribute('rel', 'noopener noreferrer');
            return a;
        }
        return el(n.t === 'b' ? 'strong' : 'em', inl(n.c));
    });
    const list = l => el(l.t, l.items.map(it => el('li', [...inl(it.c), ...(it.sub ? [list(it.sub)] : [])])));
    const blocks = bs => bs.map(b => {
        if (b.t === 'h') return el('h' + b.n, inl(b.c));
        if (b.t === 'code') { const code = el('code', [doc.createTextNode(b.v)]); if (/^[\w+-]+$/.test(b.lang)) code.setAttribute('class', 'language-' + b.lang); return el('pre', [code]); }
        if (b.t === 'ul' || b.t === 'ol') return list(b);
        return el(BLOCK[b.t], b.t === 'q' ? blocks(b.c) : inl(b.c));
    });
    const frag = doc.createDocumentFragment();
    for (const n of blocks(ast.c)) frag.appendChild(n);
    return frag;
}

/** Markdown text to a DocumentFragment, safe for untrusted input (see the hostile corpus test). */
export function renderMarkdown(text, doc = document) {
    const s = String(text ?? '');
    const frag = renderAst(parseMarkdown(s.length > MAX_PREVIEW ? s.slice(0, MAX_PREVIEW) : s), doc);
    if (s.length > MAX_PREVIEW) {
        const p = doc.createElement('p');
        p.setAttribute('class', 'pk-md-truncated');
        p.appendChild(doc.createTextNode('Preview shortened: the text is longer than ' + MAX_PREVIEW + ' characters.'));
        frag.appendChild(p);
    }
    return frag;
}
