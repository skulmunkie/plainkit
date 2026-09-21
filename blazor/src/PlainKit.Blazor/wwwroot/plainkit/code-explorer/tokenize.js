// A tiny syntax colouriser for the code explorer demo and snapshots. It is not the C# tokenizer and does not try to be:
// comments, strings, numbers, keywords and (for markup) tags, per line. Returns per-line arrays of { start, length, kind }
// where kind is one of keyword, string, comment, number, type, tag, attribute, key -- the tk-* classes in code-explorer.css.

const KEYWORDS = {
    js: 'const let var function return if else for while switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof of in this null true false undefined',
    cs: 'using namespace class struct interface enum public private protected internal static readonly sealed abstract virtual override async await var new return if else for foreach while switch case break continue try catch finally throw null true false this base void string int bool double decimal record get set',
    css: '',
    json: 'true false null',
};
const ALIASES = { javascript: 'js', mjs: 'js', ts: 'js', csharp: 'cs', razor: 'cs' };

export const languageOf = path => {
    const ext = String(path).split('.').pop().toLowerCase();
    return { js: 'js', mjs: 'js', ts: 'js', cs: 'cs', css: 'css', html: 'html', razor: 'html', json: 'json', md: 'plain' }[ext] ?? 'plain';
};

export function tokenize(lines, language = 'plain') {
    const lang = ALIASES[language] ?? language;
    const words = new Set((KEYWORDS[lang] ?? '').split(' ').filter(Boolean));
    let inBlock = false;
    return lines.map(text => {
        const tokens = [];
        const push = (start, length, kind) => length > 0 && tokens.push({ start, length, kind });
        let i = 0;
        if (lang === 'plain') return tokens;
        while (i < text.length) {
            if (inBlock) {
                const end = text.indexOf('*/', i);
                if (end === -1) { push(i, text.length - i, 'comment'); i = text.length; } else { push(i, end + 2 - i, 'comment'); i = end + 2; inBlock = false; }
                continue;
            }
            const c = text[i];
            if (lang === 'html') {
                const tag = /^<\/?[A-Za-z][\w:-]*/.exec(text.slice(i));
                if (tag) { push(i, tag[0].length, 'tag'); i += tag[0].length; continue; }
                const attr = /^\s[\w:@-]+(?==)/.exec(text.slice(i));
                if (attr) { push(i + 1, attr[0].length - 1, 'attribute'); i += attr[0].length; continue; }
            }
            if (c === '/' && text[i + 1] === '/' && lang !== 'html') { push(i, text.length - i, 'comment'); break; }
            if (c === '/' && text[i + 1] === '*') { inBlock = true; push(i, 2, 'comment'); i += 2; continue; }
            if (c === '"' || c === "'" || c === '`') {
                let j = i + 1;
                while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
                const isKey = lang === 'json' && /^\s*:/.test(text.slice(j + 1));
                push(i, Math.min(j + 1, text.length) - i, isKey ? 'key' : 'string');
                i = Math.min(j + 1, text.length);
                continue;
            }
            const num = /^\d[\d._]*/.exec(text.slice(i));
            if (num && !/[\w$]/.test(text[i - 1] ?? '')) { push(i, num[0].length, 'number'); i += num[0].length; continue; }
            const word = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
            if (word) {
                const w = word[0];
                if (words.has(w)) push(i, w.length, 'keyword');
                else if (/^[A-Z]/.test(w) && lang !== 'css') push(i, w.length, 'type');
                i += w.length;
                continue;
            }
            i++;
        }
        return tokens;
    });
}

// Cut a line at every token, match and word boundary: [{ text, kind, match, word }]. Pure; the element renders each as a span.
export function buildSegments(text, tokens = [], matches = [], wordRanges = []) {
    if (!text.length) return [];
    const cuts = new Set([0, text.length]);
    for (const r of [...tokens, ...matches, ...wordRanges]) { cuts.add(Math.max(0, r.start)); cuts.add(Math.min(text.length, r.start + r.length)); }
    const points = [...cuts].sort((a, b) => a - b);
    const inside = (ranges, at) => ranges.some(r => at >= r.start && at < r.start + r.length);
    const out = [];
    for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i];
        out.push({ text: text.slice(a, points[i + 1]), kind: tokens.find(t => a >= t.start && a < t.start + t.length)?.kind ?? 'plain', match: inside(matches, a), word: inside(wordRanges, a) });
    }
    return out;
}

// The identifier at a column of a line, or "".
export function wordAt(text, column) {
    let s = column, e = column;
    while (s > 0 && /[A-Za-z0-9_$]/.test(text[s - 1])) s--;
    while (e < text.length && /[A-Za-z0-9_$]/.test(text[e])) e++;
    return text.slice(s, e);
}
