// SVG toolkit, text out (#431, phase S5, part a). toSvg(doc) writes a document model as SVG text. Pure: no DOM, no side effects. It reads the model and the
// allow-list (allow.js) only, never a live DOM, so the output is byte-deterministic: the same document always gives the same text. Every value passes the one
// esc() on its way into the text, and an attribute the allow-list does not list for that node type is never written.

import { NODES } from './allow.js';
import { isIdentity, fmt } from './matrix.js';
import { toD } from './path.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** The one place values enter the output: & < > " ' escaped. */
export const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);

/**
 * The SVG text of `doc`: <svg> with xmlns, viewBox, width and height (in the document's units), role="img", then <title> and <desc> when set, then the nodes.
 * precision = decimals kept (0..8); compact = no indentation or line breaks.
 */
export function toSvg(doc, { precision = 3, compact = false, title, desc } = {}) {
    const p = Number.isInteger(precision) ? Math.min(8, Math.max(0, precision)) : 3;
    const num = n => fmt(n, p);
    const nl = compact ? '' : '\n';
    const pad = d => (compact ? '' : '  '.repeat(d));
    const value = (kind, v) => {
        if (kind === 'matrix') return isIdentity(v) ? null : `matrix(${v.map(num).join(' ')})`;
        if (kind === 'points') return v.reduce((out, n, i) => (i % 2 ? out[out.length - 1] += ',' + num(n) : out.push(num(n)), out), []).join(' ');
        if (kind === 'd') return toD(v, { precision: p });
        if (kind === 'dash') return v.map(num).join(' ');
        if (kind === 'bool') return v ? 'true' : 'false';
        return typeof v === 'number' ? num(v) : v;
    };
    const attrs = n => {
        let out = ` id="${esc(n.id)}"`;
        for (const [name, kind] of Object.entries(NODES[n.type] ?? {})) {
            if (!Object.hasOwn(n.attrs ?? {}, name)) continue;
            const v = value(kind, n.attrs[name]);
            if (v !== null && v !== '') out += ` ${name}="${esc(v)}"`;
        }
        return out;
    };
    const node = (n, d) => {
        if (!NODES[n.type]) return '';
        if (n.type === 'text') return `${pad(d)}<text${attrs(n)}>${esc(n.text ?? '')}</text>${nl}`;
        if (n.type !== 'g' || !n.children?.length) return `${pad(d)}<${n.type}${attrs(n)}/>${nl}`;
        return `${pad(d)}<g${attrs(n)}>${nl}${n.children.map(c => node(c, d + 1)).join('')}${pad(d)}</g>${nl}`;
    };
    const w = num(doc.width), h = num(doc.height), unit = doc.units;
    const t = title ?? doc.title, ds = desc ?? doc.desc;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}${unit}" height="${h}${unit}" role="img">${nl}`
        + (t ? `${pad(1)}<title>${esc(t)}</title>${nl}` : '') + (ds ? `${pad(1)}<desc>${esc(ds)}</desc>${nl}` : '')
        + (doc.root ? node(doc.root, 1) : '') + '</svg>';
}
