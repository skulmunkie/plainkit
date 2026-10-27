// SVG toolkit, text in and out (#431, phase S5). toSvg(doc) writes a document model as SVG text; fromSvg(text) reads untrusted SVG text into a valid model. It reads the model and the
// allow-list (allow.js) only, never a live DOM, so the output is byte-deterministic: the same document always gives the same text. Every value passes the one
// esc() on its way into the text, and an attribute the allow-list does not list for that node type is never written.

import { NODES, LIMITS, UNITS } from './allow.js';
import { isIdentity, fmt, multiply, translate, scale, rotate } from './matrix.js';
import { toD, parsePath } from './path.js';
import { createSvgDoc, normalizeDoc } from './model.js';

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
        + (doc.root?.children ?? []).map(c => node(c, 1)).join('') + '</svg>';
}

// ---------------------------------------------------------------- text in

const SVG_NS = 'http://www.w3.org/2000/svg';
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i;
const SILENT = /^(?:xmlns(?::.*)?|id|xml:space|version|role)$/i;      // never part of the model; ids are assigned by it
const UNSAFE = /javascript:|data:/i;
const problem = (code, message, path, severity = 'warn') => ({ code, severity, message, path });
const empty = (code, message) => ({ doc: createSvgDoc(), problems: [problem(code, message, '', 'error')] });

/**
 * Reads SVG text into a document. Never throws and always returns a valid document plus a list of problems { code, severity, message, path }. Only the node
 * types and attributes of the allow-list survive; scripts, handlers, links, styles, <use>, <image>, <foreignObject>, DTDs and foreign namespaces are dropped
 * (each one listed). `parse(text)` is required (this module names no DOM): the caller passes text => new DOMParser().parseFromString(text, 'image/svg+xml') in a browser; it returns a document with a documentElement.
 */
export function fromSvg(text, { limits = {}, parse } = {}) {
    const L = Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, Math.min(v, Number.isFinite(limits?.[k]) ? limits[k] : v)]));
    if (typeof text !== 'string') return empty('input-type', 'The input is not text.');
    if (text.length > L.input) return empty('input-size', 'The input is larger than the limit.');
    if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(text)) return empty('dtd', 'A DOCTYPE or ENTITY declaration is not allowed.');
    let dom = null;
    if (typeof parse !== 'function') return empty('input-parser', 'No parser was given.');
    try { dom = parse(text); } catch (e) { return empty('malformed', 'The input could not be parsed.'); }
    const root = dom?.documentElement;
    if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS || dom.getElementsByTagName?.('parsererror')?.length) return empty('malformed', 'The input is not well-formed SVG.');

    const problems = [];
    const limited = new Set();
    const limit = (kind, message, path) => { if (!limited.has(kind)) { limited.add(kind); problems.push(problem('limit', message, path)); } };
    let count = 0;
    const num = (v, path) => {
        if (typeof v !== 'string' || !NUMBER.test(v.trim())) return null;
        const n = Number(v.trim().replace(/px$/i, ''));
        if (!Number.isFinite(n)) return null;
        if (Math.abs(n) > L.coord) { limit('coord', `A coordinate is larger than ${L.coord}; clamped.`, path); return Math.sign(n) * L.coord; }
        return n;
    };
    const list = (v, path) => {
        const parts = String(v).trim().split(/[\s,]+/).filter(Boolean);
        const out = parts.map(p => num(p, path));
        return parts.length && out.every(n => n !== null) ? out : null;
    };
    const transform = v => {
        const re = /(matrix|translate|scale|rotate)\(([^()]*)\)/g;
        if (String(v).replace(re, '').replace(/[\s,]/g, '')) return null;
        let m = [1, 0, 0, 1, 0, 0], used = 0, mt;
        while ((mt = re.exec(v))) {
            used++;
            const a = mt[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
            if (!a.every(Number.isFinite)) return null;
            let t;
            if (mt[1] === 'matrix' && a.length === 6) t = a;
            else if (mt[1] === 'translate' && a.length >= 1 && a.length <= 2) t = translate(...a);
            else if (mt[1] === 'scale' && a.length >= 1 && a.length <= 2) t = scale(...a);
            else if (mt[1] === 'rotate' && (a.length === 1 || a.length === 3)) t = rotate(...a);
            else return null;
            m = multiply(m, t);
        }
        return used ? m : null;
    };
    const value = (kind, raw, path) => {
        if (Array.isArray(kind)) return raw;
        switch (kind) {
            case 'n': case 'p': case 'o': return num(raw, path);
            case 'bool': return raw === 'true' ? true : raw === 'false' ? false : null;
            case 'matrix': return transform(raw);
            case 'points': { const l = list(raw, path); return l && l.length % 2 === 0 ? l : null; }
            case 'dash': return list(raw, path);
            case 'd': { const r = parsePath(raw, L); return r.segments.length ? r.segments : null; }
            default: return raw;
        }
    };
    const attrs = (el, type, path) => {
        const out = {}, allowed = NODES[type];
        for (const a of Array.from(el.attributes ?? [])) {
            const name = a.name, at = `${path}@${name}`;
            const hostile = /^on/i.test(name) || /href$/i.test(name) || (a.namespaceURI && a.namespaceURI !== SVG_NS && !/xmlns/i.test(name)) || UNSAFE.test(String(a.value).replace(/[\s\u0000-\u001f]/g, ''));
            if (!hostile && SILENT.test(name)) continue;
            if (hostile || !Object.hasOwn(allowed, name)) { problems.push(problem('dropped-attr', `The attribute ${name} is not allowed on ${type}; dropped.`, at)); continue; }
            const v = value(allowed[name], a.value, at);
            if (v === null || v === undefined) problems.push(problem('dropped-attr', `The value of ${name} on ${type} is not valid; dropped.`, at));
            else out[name] = v;
        }
        return out;
    };
    const kids = (el, depth, path) => {
        const out = [], seen = {};
        for (const c of Array.from(el.children ?? [])) {
            const name = String(c.localName);
            seen[name] = (seen[name] ?? 0) + 1;
            const n = node(c, depth, `${path}/${name}[${seen[name]}]`);
            if (n) out.push(n);
        }
        return out;
    };
    const node = (el, depth, path) => {
        const type = String(el.localName);
        if (el.namespaceURI !== SVG_NS || !Object.hasOwn(NODES, type)) { problems.push(problem('dropped-node', `The element ${type} is not allowed; dropped with its children.`, path)); return null; }
        if (depth > L.depth) { limit('depth', `Nesting is deeper than ${L.depth}; the rest was dropped.`, path); return null; }
        if (count >= L.nodes) { limit('nodes', `More than ${L.nodes} nodes; the rest were dropped.`, path); return null; }
        count++;
        const out = { type, attrs: attrs(el, type, path) }, id = el.getAttribute?.('id');
        if (typeof id === 'string') out.id = id;     // the model keeps it only if it is a well-formed, unused id
        if (type === 'text') out.text = String(el.textContent ?? '');
        if (type === 'g') out.children = kids(el, depth + 1, path);
        return out;
    };

    let title = '', desc = '';
    const body = [], seen = {};
    for (const c of Array.from(root.children ?? [])) {
        const name = String(c.localName);
        seen[name] = (seen[name] ?? 0) + 1;
        if (c.namespaceURI === SVG_NS && (name === 'title' || name === 'desc')) { if (name === 'title') title = String(c.textContent ?? ''); else desc = String(c.textContent ?? ''); continue; }
        const n = node(c, 2, `svg/${name}[${seen[name]}]`);
        if (n) body.push(n);
    }
    const vb = list(root.getAttribute?.('viewBox') ?? '', 'svg@viewBox');
    const size = (name, i) => {
        const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(px|mm|cm|in|pt)?\s*$/i.exec(root.getAttribute?.(name) ?? '');
        if (m) return { n: Number(m[1]), unit: (m[2] ?? 'px').toLowerCase() };
        return { n: vb && vb.length === 4 ? vb[i] : undefined, unit: 'px' };
    };
    const w = size('width', 2), h = size('height', 3);
    const raw = { version: 1, seq: 1, width: w.n, height: h.n, units: UNITS.includes(w.unit) ? w.unit : 'px', title, desc, root: { type: 'g', attrs: {}, children: body } };
    const { doc, problems: more } = normalizeDoc(raw, L);
    return { doc, problems: [...problems, ...more] };
}
