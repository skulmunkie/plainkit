// Markdown (a small CommonMark subset) to a plain AST. Pure, no DOM, linear-ish. Raw HTML is not special: it stays text.
// Blocks: p, h (1-3), ul/ol (items hold inlines and one nested list), q (blockquote), code (fenced). Inlines: text, b, i, code, a.
// Nodes: {t:'p'|'q'|'doc', c}, {t:'h', n, c}, {t:'ul'|'ol', items:[{c, sub}]}, {t:'code', v, lang}, {t:'text'|'code', v}, {t:'b'|'i', c}, {t:'a', href, c}.
import { isSafeUrl } from '../safe-url.js';

const MAX_DEPTH = 6;
/** The schemes a rendered link may use; a relative address is always allowed. */
export const LINK_SCHEMES = ['http', 'https', 'mailto'];
export const safeMdUrl = u => isSafeUrl(u, LINK_SCHEMES);

/** Inline text to nodes. A delimiter that finds no partner is text; a search that failed once is never repeated (keeps it linear). */
export function parseInline(s, depth = 0) {
    const out = [];
    let text = '', i = 0;
    const dead = new Set();
    const find = (tok, from) => { if (dead.has(tok)) return -1; const k = s.indexOf(tok, from); if (k < 0) dead.add(tok); return k; };
    const flush = () => { if (text) out.push({ t: 'text', v: text }); text = ''; };
    while (i < s.length) {
        const ch = s[i];
        if (ch === '\\' && i + 1 < s.length && /[\\`*[\]()#>_-]/.test(s[i + 1])) { text += s[i + 1]; i += 2; continue; }
        let end;
        if (ch === '`' && (end = find('`', i + 1)) > i + 1) { flush(); out.push({ t: 'code', v: s.slice(i + 1, end) }); i = end + 1; continue; }
        if (ch === '*' && depth < MAX_DEPTH) {
            const dbl = s[i + 1] === '*', tok = dbl ? '**' : '*';
            end = -1;
            if (!/\s/.test(s[i + tok.length] ?? ' ')) {
                // the closer follows a non-space and, for a single star, is not part of a double
                for (let k = find(tok, i + tok.length); k > 0; k = find(tok, k + 1)) {
                    if (!/\s/.test(s[k - 1]) && (dbl || (s[k - 1] !== '*' && s[k + 1] !== '*'))) { end = k; break; }
                }
            }
            if (end > i + tok.length) { flush(); out.push({ t: dbl ? 'b' : 'i', c: parseInline(s.slice(i + tok.length, end), depth + 1) }); i = end + tok.length; continue; }
        }
        if (ch === '[' && depth < MAX_DEPTH) {
            const mid = find('](', i + 1), close = mid > 0 ? find(')', mid + 2) : -1;
            if (close > 0 && !s.slice(i + 1, mid).includes('\n')) {
                const href = s.slice(mid + 2, close).trim(), c = parseInline(s.slice(i + 1, mid), depth + 1);
                flush();
                if (safeMdUrl(href)) out.push({ t: 'a', href, c }); else out.push(...c);
                i = close + 1; continue;
            }
        }
        text += ch; i++;
    }
    flush();
    return out;
}

const LI = /^( *)([-*+]|\d{1,9}[.)]) +(.*)$/;
const FENCE = /^ {0,3}(`{3,})\s*([\w+-]*)\s*$/;

/** Markdown text to a `{t:'doc', c:[blocks]}` tree. */
export function parseMarkdown(src, depth = 0) {
    const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
    const c = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) { i++; continue; }
        let m = FENCE.exec(line);
        if (m) {
            const body = [];
            for (i++; i < lines.length && !(/^`+\s*$/.test(lines[i].trim()) && lines[i].trim().startsWith(m[1])); i++) body.push(lines[i]);
            i++;
            c.push({ t: 'code', v: body.join('\n'), lang: m[2] });
            continue;
        }
        if ((m = /^ {0,3}(#{1,3})\s+(.*?)\s*#*\s*$/.exec(line))) { c.push({ t: 'h', n: m[1].length, c: parseInline(m[2]) }); i++; continue; }
        if (/^ {0,3}>/.test(line)) {
            const body = [];
            for (; i < lines.length && /^ {0,3}>/.test(lines[i]); i++) body.push(lines[i].replace(/^ {0,3}> ?/, ''));
            c.push({ t: 'q', c: depth < MAX_DEPTH ? parseMarkdown(body.join('\n'), depth + 1).c : [{ t: 'p', c: [{ t: 'text', v: body.join('\n') }] }] });
            continue;
        }
        if ((m = LI.exec(line))) {
            const list = { t: /\d/.test(m[2]) ? 'ol' : 'ul', items: [] };
            const base = m[1].length;
            for (; i < lines.length && (m = LI.exec(lines[i])); i++) {
                const ind = m[1].length, ordered = /\d/.test(m[2]);
                if (ind >= base + 2 && list.items.length) {
                    const item = list.items[list.items.length - 1];
                    (item.sub ??= { t: ordered ? 'ol' : 'ul', items: [] }).items.push({ c: parseInline(m[3]), sub: null });
                } else if (ind < base + 2) {
                    if (ordered !== (list.t === 'ol')) break;
                    list.items.push({ c: parseInline(m[3]), sub: null });
                }
            }
            c.push(list);
            continue;
        }
        const para = [];
        for (; i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !/^ {0,3}(#{1,3}\s|>)/.test(lines[i]) && !(para.length && LI.test(lines[i])); i++) para.push(lines[i].trim());
        c.push({ t: 'p', c: parseInline(para.join('\n')) });
    }
    return { t: 'doc', c };
}
