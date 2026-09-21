// A small Markdown converter for the Guides (site/guides/content/*.md), used at BUILD time only: dependency-free, deterministic, no DOM.
//
//   import { markdownToHtml, parseFrontMatter } from './markdown.mjs';
//   const { html, headings, problems } = markdownToHtml(body, { linkFor, imageFor });
//   linkFor(href): a link to a bare file name (`other.md`, `other.md#heading`) goes through it; return the address to use, or null when there is no such target (a problem).
//   imageFor(src): return the address an image is served from, or null when it is not found (a problem). Without either, the address is used as written.
//
// What it reads: ATX headings (## and below; the page title comes from the front matter, so a body `#` is a problem), paragraphs, bullet and numbered lists
// (nested by indentation), fenced code blocks (the language becomes the pk-code-block label), pipe tables, blockquotes (a pk-alert; an optional first line
// `[!note]`, `[!tip]`, `[!warning]` or `[!danger]` picks the kind), horizontal rules, images, links, `code`, **bold** and *italic*.
//
// It is a sanitiser as much as a converter: raw HTML is never passed through (it is escaped and shown as text), a link or image address must be http(s),
// mailto, a fragment or a relative path (a script or data address is dropped and reported), and every attribute value is escaped. Headings get a stable id
// (the same slug pk-toc would make, unique per page) and an empty permalink link that CSS draws. `problems` lists what an author should fix (build fails on them).
import { slug } from '../elements/toc/toc.js';

export const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `---` front matter of `key: value` lines: { data, body }. A file without it has empty data. */
export function parseFrontMatter(text) {
    const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text.replace(/\r\n/g, '\n'));
    if (!m) return { data: {}, body: text.replace(/\r\n/g, '\n') };
    const data = {};
    for (const line of m[1].split('\n')) { const kv = /^([\w-]+):\s*(.*)$/.exec(line); if (kv) data[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2'); }
    return { data, body: text.replace(/\r\n/g, '\n').slice(m[0].length) };
}

const ALERT_KINDS = { note: 'info', info: 'info', important: 'info', tip: 'success', success: 'success', warning: 'warning', caution: 'warning', danger: 'danger' };
const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/, HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/, HR = /^ {0,3}([-*_])( *\1){2,} *$/, QUOTE = /^ {0,3}>/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\S.*|)$|^(\s*)([-*+]|\d{1,9}[.)])$/, ROW_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const indentOf = s => /^ */.exec(s)[0].length;
const isStart = (lines, i) => FENCE.test(lines[i]) || HEADING.test(lines[i]) || HR.test(lines[i]) || QUOTE.test(lines[i]) || LIST.test(lines[i]) || isTable(lines, i);
const isTable = (lines, i) => lines[i]?.includes('|') && i + 1 < lines.length && ROW_SEP.test(lines[i + 1]) && lines[i + 1].includes('-');
const cells = row => row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));

// A link or image address: http(s), mailto, a fragment or a relative path. Any other scheme (a script, data or vbscript address) is refused.
function safeUrl(raw) {
    const url = raw.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/[\x00-\x20\x7f]/g, ''); // raw is already escaped text
    if (!url) return null;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
    return scheme && !['http', 'https', 'mailto'].includes(scheme[1].toLowerCase()) ? null : url;
}

export function markdownToHtml(source, { linkFor = null, imageFor = null } = {}) {
    const problems = [], headings = [], taken = new Set();
    const problem = msg => problems.push(msg);

    // Finished pieces (code, links, images) are held out of the text while emphasis is applied, then put back; the stash is shared so a link's label can hold code.
    const stash = [], hold = html => `\uE000${stash.push(html) - 1}\uE001`;
    function inline(text, nested = false) {
        let s = nested ? text : text.replace(/[\uE000\uE001]/g, '');
        s = s.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) => hold(`<code>${escapeHtml(code.replace(/^ (.*) $/, '$1'))}</code>`));
        s = escapeHtml(s);
        s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (all, alt, raw) => {
            const url = safeUrl(raw);
            if (!url) { problem(`image address ${raw} is not http(s) or a relative path`); return hold(all); }
            const src = imageFor ? imageFor(url) : url;
            if (src == null) { problem(`image ${url} was not found`); return hold(all); }
            return hold(`<img src="${escapeHtml(src)}" alt="${alt}" loading="lazy">`);
        });
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, raw) => {
            let url = safeUrl(raw);
            if (!url) { problem(`link address ${raw} is not http(s), mailto, a fragment or a relative path`); return hold(all); }
            if (linkFor && /^[\w-]+\.md(#[\w-]+)?$/.test(url)) { const to = linkFor(url); if (to == null) { problem(`link to ${url}: no such guide`); return hold(all); } url = to; }
            return hold(`<a href="${escapeHtml(url)}">${inline(label, true)}</a>`);
        });
        s = s.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>').replace(/(?<![\w*])\*(?=[^\s*])([^*]+?)(?<=[^\s*])\*(?![\w*])/g, '<em>$1</em>').replace(/(?<![\w])_(?=[^\s_])([^_]+?)(?<=[^\s_])_(?!\w)/g, '<em>$1</em>');
        for (let n = 0; /\uE000/.test(s) && n < 8; n++) s = s.replace(/\uE000(\d+)\uE001/g, (_, i) => stash[i]);
        return s;
    }

    function blocks(lines) {
        const out = [];
        for (let i = 0; i < lines.length;) {
            const line = lines[i]; let m;
            if (!line.trim()) { i++; continue; }
            if ((m = FENCE.exec(line))) {
                const body = []; let j = i + 1;
                while (j < lines.length && !new RegExp(`^\\s*${m[1][0]}{${m[1].length},}\\s*$`).test(lines[j])) body.push(lines[j++]);
                if (j >= lines.length) problem(`a code fence (${m[1]}${m[2]}) is never closed`);
                const strip = Math.min(indentOf(line), ...body.filter(l => l.trim()).map(indentOf));
                out.push(`<pk-code-block${m[2] ? ` label="${escapeHtml(m[2])}"` : ''}>${escapeHtml(body.map(l => l.slice(strip)).join('\n'))}</pk-code-block>`);
                i = j + 1; continue;
            }
            if ((m = HEADING.exec(line))) {
                const level = m[1].length, text = m[2].replace(/[\uE000\uE001]/g, '');
                if (level === 1) problem(`"# ${text}": the page title comes from the front matter, start at ##`);
                else if (level > (headings.at(-1)?.level ?? 1) + 1) problem(`"${text}" jumps from h${headings.at(-1)?.level ?? 1} to h${level}`);
                const plain = text.replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '');
                const id = slug(plain, taken); taken.add(id); headings.push({ level, id, text: plain });
                out.push(`<h${level} id="${id}">${inline(text)}<a class="anchor" href="#${id}" aria-label="Link to this section"></a></h${level}>`); i++; continue;
            }
            if (HR.test(line)) { out.push('<hr>'); i++; continue; }
            if (QUOTE.test(line)) {
                const q = []; let j = i;
                while (j < lines.length && (QUOTE.test(lines[j]) || (lines[j].trim() && !isStart(lines, j) && q.length))) q.push(lines[j++].replace(/^ {0,3}> ?/, ''));
                const tag = /^\[!(\w+)\]\s*(.*)$/.exec(q[0]);
                if (tag && !ALERT_KINDS[tag[1].toLowerCase()]) problem(`[!${tag[1]}] is not an alert kind (note, tip, warning, danger)`);
                const kind = tag && ALERT_KINDS[tag[1].toLowerCase()];
                if (kind) q[0] = tag[2];
                out.push(`<pk-alert kind="${kind || 'info'}">${blocks(q).join('\n')}</pk-alert>`); i = j; continue;
            }
            if (isTable(lines, i)) {
                const head = cells(line), rows = []; let j = i + 2;
                while (j < lines.length && lines[j].trim() && lines[j].includes('|')) rows.push(cells(lines[j++]));
                const td = (tag, c) => `<${tag}${tag === 'th' ? ' scope="col"' : ''}>${inline(c)}</${tag}>`;
                out.push(`<div class="table-wrap" role="region" aria-label="Table" tabindex="0"><table><thead><tr>${head.map(c => td('th', c)).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, k) => td('td', r[k] ?? '')).join('')}</tr>`).join('')}</tbody></table></div>`);
                i = j; continue;
            }
            if ((m = LIST.exec(line))) {
                const base = (m[1] ?? m[5]).length, ordered = /\d/.test(m[2] ?? m[6]), items = []; let j = i, start = null;
                while (j < lines.length && (m = LIST.exec(lines[j])) && (m[1] ?? m[5]).length === base && /\d/.test(m[2] ?? m[6]) === ordered) {
                    if (start === null) start = parseInt(m[2] ?? m[6], 10);
                    const gap = (m[3] ?? ' ').length, width = base + (m[2] ?? m[6]).length + (gap > 4 ? 1 : gap), item = [m[4] ?? '']; j++;
                    for (; j < lines.length; j++) {
                        const l = lines[j];
                        if (!l.trim()) { const next = lines.slice(j).find(x => x.trim()); if (next !== undefined && indentOf(next) >= width) { item.push(''); continue; } break; }
                        if (indentOf(l) >= width) item.push(l.slice(width));
                        else if (item.at(-1) !== '' && !isStart(lines, j)) item.push(l.trim());
                        else break;
                    }
                    const inner = blocks(item);
                    if (!item.includes('')) inner[0] = inner[0].replace(/^<p>([\s\S]*)<\/p>$/, '$1'); // a tight item shows its text without a paragraph
                    items.push(`<li>${inner.join('\n')}</li>`);
                    while (j < lines.length && !lines[j].trim() && LIST.test(lines.slice(j).find(x => x.trim()) ?? '')) j++;
                }
                const tag = ordered ? 'ol' : 'ul';
                out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</${tag}>`); i = j; continue;
            }
            const para = [line.trim()]; let j = i + 1;
            while (j < lines.length && lines[j].trim() && !isStart(lines, j)) para.push(lines[j++].trim());
            out.push(`<p>${inline(para.join(' '))}</p>`); i = j;
        }
        return out;
    }

    return { html: blocks(source.replace(/\r\n?/g, '\n').split('\n')).join('\n'), headings, problems };
}
