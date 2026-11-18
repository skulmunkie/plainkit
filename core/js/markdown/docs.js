// The documentation subset of Markdown (#2012), on top of parse.js and render.js: pipe tables, images, headings 4 to 6, slug ids on headings and address
// resolving. Only pk-markdown imports it, so pk-markdown-editor's preview chunk stays as small as it was. Nothing here writes markup: nodes are built by
// render.js's ext hook with createElement/setAttribute, and every address is checked again after it is resolved.
import { parseMarkdown, parseInline, safeMdUrl } from './parse.js';
import { renderAst, MAX_PREVIEW } from './render.js';
import { isSafeUrl } from '../safe-url.js';

/** An image source: http, https or relative (never mailto). */
const safeImgUrl = u => isSafeUrl(u, ['http', 'https']);
/** The text of an inline list, markup dropped (an image's alt, a heading's slug). */
const plain = nodes => nodes.map(n => (n.v ?? (n.t === 'img' ? n.alt : plain(n.c ?? [])))).join('');
const slug = s => s.toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';

const DELIM = /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
/** A table row's cells: outer pipes dropped, \| is a literal pipe. */
const cells = line => {
    const s = line.trim().replace(/^\|/, ''), out = [];
    let cur = '';
    for (let k = 0; k < s.length; k++) {
        if (s[k] === '\\' && s[k + 1] === '|') { cur += '|'; k++; } else if (s[k] === '|') { out.push(cur.trim()); cur = ''; } else cur += s[k];
    }
    if (cur.trim() || !out.length) out.push(cur.trim());
    return out;
};
const isTableAt = (lines, i) => lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && DELIM.test(lines[i + 1]) && cells(lines[i]).length === cells(lines[i + 1]).length;

/** Text to the base tree plus {t:'table', align, head, rows} and {t:'h', n:4-6}; tables and deep headings outside fences split the text into base-parsed runs. */
export function parseDocs(src) {
    const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n'), c = [];
    let buf = [], fence = null, m;
    const flush = () => { if (buf.length) c.push(...parseMarkdown(buf.join('\n')).c); buf = []; };
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (fence) { if (/^`+\s*$/.test(l.trim()) && l.trim().startsWith(fence)) fence = null; buf.push(l); continue; }
        if ((m = /^ {0,3}(`{3,})\s*[\w+-]*\s*$/.exec(l))) { fence = m[1]; buf.push(l); continue; }
        if (isTableAt(lines, i)) {
            flush();
            const align = cells(lines[i + 1]).map(d => (d.startsWith(':') ? (d.endsWith(':') ? 'center' : 'left') : d.endsWith(':') ? 'right' : null));
            const row = r => { const cs = cells(r); return align.map((_, k) => parseInline(cs[k] ?? '')); };
            const t = { t: 'table', align, head: row(l), rows: [] };
            for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) t.rows.push(row(lines[i]));
            i--;
            c.push(t);
        } else if ((m = /^ {0,3}(#{4,6})\s+(.*?)\s*#*\s*$/.exec(l))) { flush(); c.push({ t: 'h', n: m[1].length, c: parseInline(m[2]) }); } else buf.push(l);
    }
    flush();
    return { t: 'doc', c };
}

/** Images (a link preceded by "!"), address resolving and heading ids, applied to a parsed tree. */
const finish = (ast, { ids, resolve }) => {
    const used = new Set();
    const fix = (u, kind) => { const r = u.startsWith('#') || !resolve ? u : resolve(u, kind); return typeof r === 'string' && (kind === 'image' ? safeImgUrl(r) : safeMdUrl(r)) ? r : null; };
    const inl = nodes => {
        const out = [];
        for (const n of nodes) {
            const prev = out[out.length - 1];
            if (n.t === 'a' && prev?.t === 'text' && prev.v.endsWith('!')) {
                prev.v = prev.v.slice(0, -1);
                const alt = plain(n.c), src = safeImgUrl(n.href) ? fix(n.href, 'image') : null;
                out.push(src === null ? { t: 'text', v: alt } : { t: 'img', alt, src });
                continue;
            }
            if (n.t === 'a') { const h = fix(n.href, 'link'); n.href = h ?? ''; }
            if (n.c) n.c = inl(n.c);
            out.push(n);
        }
        return out.filter(n => n.t !== 'text' || n.v);
    };
    const blocks = bs => {
        for (const b of bs) {
            if (b.t === 'table') { b.head = b.head.map(inl); b.rows = b.rows.map(r => r.map(inl)); continue; }
            if (b.t === 'ul' || b.t === 'ol') { for (const it of b.items) { it.c = inl(it.c); if (it.sub) for (const s of it.sub.items) s.c = inl(s.c); } continue; }
            if (b.t === 'q') { blocks(b.c); continue; }
            if (b.c && b.t !== 'code') b.c = inl(b.c);
            if (b.t === 'h' && ids) {
                const base = slug(plain(b.c));
                let id = base;
                for (let k = 1; used.has(id); k++) id = base + '-' + k;
                used.add(id); b.id = id; b.t = 'hd';
            }
        }
    };
    blocks(ast.c);
    return ast;
};

/** The render hook: tables, images and headings with an id. */
const ext = (n, el, inl) => {
    if (n.t === 'img') {
        const i = el('img', []);
        i.setAttribute('alt', n.alt); i.setAttribute('src', n.src); i.setAttribute('loading', 'lazy');
        return i;
    }
    if (n.t === 'hd') { const h = el('h' + n.n, inl(n.c)); h.setAttribute('id', n.id); return h; }
    if (n.t === 'table') {
        const row = (cs, tag) => el('tr', cs.map((c, k) => { const d = el(tag, inl(c)); if (n.align[k]) d.setAttribute('class', 'pk-md-' + n.align[k]); return d; }));
        const wrap = el('div', [el('table', [el('thead', [row(n.head, 'th')]), el('tbody', n.rows.map(r => row(r, 'td')))])]);
        wrap.setAttribute('class', 'pk-md-table'); wrap.setAttribute('tabindex', '0');
        return wrap;
    }
    return undefined;
};

/**
 * Markdown text to a DocumentFragment with the documentation subset. Options: \`ids\` gives each heading a slug id; \`resolve(url, kind)\` ('link' | 'image') returns
 * the address to use (null drops it, an unsafe result is dropped too); an in-page #anchor is not passed to it.
 */
export function renderDocs(text, doc = document, opts = {}) {
    const s = String(text ?? ''), cut = s.length > MAX_PREVIEW;
    const frag = renderAst(finish(parseDocs(cut ? s.slice(0, MAX_PREVIEW) : s), opts), doc, ext);
    if (cut) {
        const p = doc.createElement('p');
        p.setAttribute('class', 'pk-md-truncated');
        p.appendChild(doc.createTextNode('Preview shortened: the text is longer than ' + MAX_PREVIEW + ' characters.'));
        frag.appendChild(p);
    }
    return frag;
}
