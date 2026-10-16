// The editing commands as pure functions: (text, start, end[, arg]) -> { text, start, end }. No DOM; the editor applies the result with setRangeText.
// A link address the preview would refuse changes nothing and returns `error`.
import { safeMdUrl } from './parse.js';

const res = (text, start, end) => ({ text, start, end });
const norm = (t, a, b) => [Math.max(0, Math.min(a, b, t.length)), Math.min(Math.max(a, b), t.length)];

/** Wrap the selection in a marker (`**`, `*`), or unwrap it when already wrapped (markers just outside, or inside, the selection). */
export function toggleWrap(text, a, b, mark) {
    const [s, e] = norm(text, a, b), n = mark.length, one = n === 1;
    if (s >= n && text.slice(s - n, s) === mark && text.slice(e, e + n) === mark && !(one && (text[s - 2] === '*' || text[e + 1] === '*')))
        return res(text.slice(0, s - n) + text.slice(s, e) + text.slice(e + n), s - n, e - n);
    const sel = text.slice(s, e);
    if (sel.length > 2 * n && sel.startsWith(mark) && sel.endsWith(mark) && !(one && (sel[1] === '*' || sel.at(-2) === '*')))
        return res(text.slice(0, s) + sel.slice(n, -n) + text.slice(e), s, e - 2 * n);
    return res(text.slice(0, s) + mark + sel + mark + text.slice(e), s + n, e + n);
}
export const toggleBold = (t, a, b) => toggleWrap(t, a, b, '**');
export const toggleItalic = (t, a, b) => toggleWrap(t, a, b, '*');

const MARK = { ul: /^(\s*)[-*+] /, ol: /^(\s*)\d+[.)] /, any: /^(\s*)(?:[-*+]|\d+[.)]) +/ };

/** Make every selected line an item of `kind` ('ul' | 'ol'); when all already are, remove the markers. Numbering restarts at 1. */
export function toggleList(text, a, b, kind) {
    const [s, e] = norm(text, a, b);
    const from = text.lastIndexOf('\n', s - 1) + 1, nl = text.indexOf('\n', e), to = nl < 0 ? text.length : nl;
    const lines = text.slice(from, to).split('\n'), re = MARK[kind];
    const one = lines.length === 1, all = lines.some(l => l.trim()) && lines.every(l => !l.trim() || re.test(l));
    let k = 0;
    const body = lines.map(l => {
        if (!l.trim() && !one) return l;
        if (all) return l.replace(re, '$1');
        k++;
        return l.replace(MARK.any, '$1').replace(/^(\s*)/, `$1${kind === 'ol' ? k + '. ' : '- '}`);
    }).join('\n');
    return res(text.slice(0, from) + body + text.slice(to), from, from + body.length);
}
export const toggleBullets = (t, a, b) => toggleList(t, a, b, 'ul');
export const toggleNumbers = (t, a, b) => toggleList(t, a, b, 'ol');

/** Insert `[selection](url)`; the selection is the link text (the url when nothing is selected). */
export function insertLink(text, a, b, url) {
    const [s, e] = norm(text, a, b), href = String(url ?? '').trim();
    if (!safeMdUrl(href) || /[()\s]/.test(href)) return { ...res(text, s, e), error: 'Use an http, https or mailto address, or a relative one, without spaces or brackets.' };
    const label = text.slice(s, e) || href;
    return res(text.slice(0, s) + `[${label}](${href})` + text.slice(e), s + 1, s + 1 + label.length);
}
