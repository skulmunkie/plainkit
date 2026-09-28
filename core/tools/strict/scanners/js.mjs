// Dependency-free JS/TS/JSX/TSX tokenizer (design section 4.1). Comment-and-string aware: gives identifiers,
// strings/templates, and regex literals, which is what later rules (S2, S5, S7, D3-D7, T1-T3) read. JSX markup
// found in the token stream is re-fed to the HTML tag tokenizer (scanHtml), so a JSX tag/component is seen the
// same way markup is. This is an approximation (design section 4.2, "honest limits"): only the opening or
// self-closing tag itself is re-parsed as markup, not the JSX subtree, so an expression inside JSX children is
// scanned as JS, same as it is at the top level.

import { makePosAt } from './util.mjs';
import { scanHtml } from './html.mjs';

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const PUNCT_BEFORE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '/', '%', '<', '>', '^', '~']);
const JSX_OPEN_CONTEXT = new Set(['', '(', ',', '{', '[', '?', ':', '=', 'jsx', 'return']);
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const NUMBER_RE = /^(?:0[xXbBoO][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)n?/;

export function scanJs(text) {
    const at = makePosAt(text);
    const tokens = [];
    const jsx = [];
    const n = text.length;
    let i = 0;
    let last = '';

    const push = (kind, value, start) => {
        const pos = at(start);
        tokens.push({ kind, value, line: pos.line, column: pos.column });
        if (kind !== 'comment') last = kind === 'punct' || kind === 'keyword' ? value : kind;
    };

    while (i < n) {
        const c = text[i];
        if (c === '/' && text[i + 1] === '/') {
            const end = text.indexOf('\n', i);
            push('comment', text.slice(i, end === -1 ? n : end), i);
            i = end === -1 ? n : end;
            continue;
        }
        if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            const stop = end === -1 ? n : end + 2;
            push('comment', text.slice(i, stop), i);
            i = stop;
            continue;
        }
        if (c === '"' || c === "'") {
            const start = i;
            i = skipQuoted(text, i, c);
            push('string', text.slice(start + 1, Math.max(start + 1, i - 1)), start);
            continue;
        }
        if (c === '`') {
            const start = i;
            i = skipTemplate(text, i);
            push('template', text.slice(start, i), start);
            continue;
        }
        if (c === '/' && (PUNCT_BEFORE_REGEX.has(last) || KEYWORDS_BEFORE_REGEX.has(last))) {
            const end = skipRegex(text, i);
            if (end !== -1) { push('regex', text.slice(i, end), i); i = end; continue; }
        }
        if (/\s/.test(c)) { i++; continue; }
        if (c === '<' && JSX_OPEN_CONTEXT.has(last) && /[A-Za-z]/.test(text[i + 1] || '')) {
            const node = scanHtml(text.slice(i)).nodes[0];
            if (node && node.line === 1) {
                const pos = at(i);
                jsx.push({ ...node, line: pos.line, column: node.column + pos.column - 1 });
                i = findTagEnd(text, i);
                last = 'jsx';
                continue;
            }
        }
        const numMatch = /\d/.test(c) ? NUMBER_RE.exec(text.slice(i)) : null;
        if (numMatch) { push('number', numMatch[0], i); i += numMatch[0].length; continue; }
        const idMatch = IDENT_RE.exec(text.slice(i));
        if (idMatch) {
            push(KEYWORDS_BEFORE_REGEX.has(idMatch[0]) ? 'keyword' : 'identifier', idMatch[0], i);
            i += idMatch[0].length;
            continue;
        }
        push('punct', c, i);
        i++;
    }
    return { tokens, jsx };
}

function skipQuoted(text, start, quote) {
    let i = start + 1;
    while (i < text.length && text[i] !== quote) { if (text[i] === '\\') i++; i++; }
    return Math.min(i + 1, text.length);
}

function skipTemplate(text, start) {
    let i = start + 1;
    const n = text.length;
    while (i < n && text[i] !== '`') {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === '$' && text[i + 1] === '{') { i = skipTemplateExpr(text, i + 2); continue; }
        i++;
    }
    return Math.min(i + 1, n);
}

// Skips a `${ ... }` body, honouring nested braces, strings and nested template literals.
function skipTemplateExpr(text, start) {
    let depth = 1, i = start;
    const n = text.length;
    while (i < n && depth > 0) {
        const c = text[i];
        if (c === '{') { depth++; i++; }
        else if (c === '}') { depth--; i++; }
        else if (c === '"' || c === "'") { i = skipQuoted(text, i, c); }
        else if (c === '`') { i = skipTemplate(text, i); }
        else i++;
    }
    return i;
}

function skipRegex(text, start) {
    let i = start + 1;
    const n = text.length;
    let inClass = false;
    while (i < n) {
        const c = text[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '\n') return -1;
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { i++; while (/[a-z]/i.test(text[i] || '')) i++; return i; }
        i++;
    }
    return -1;
}

function findTagEnd(text, start) {
    let i = start + 1;
    const n = text.length;
    let quote = null;
    while (i < n) {
        const c = text[i];
        if (quote) { if (c === quote) quote = null; i++; continue; }
        if (c === '"' || c === "'") { quote = c; i++; continue; }
        if (c === '>') return i + 1;
        i++;
    }
    return n;
}
