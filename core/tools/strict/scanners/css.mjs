// Dependency-free CSS tokenizer (design section 4.1): comments, strings, `{}` nesting, `@media`/`@layer`/
// `@supports`/`@keyframes`/... recursion, and declaration splitting. Same approach as the literalColours/
// unusedSelectors regex scans in core/js/quality.js, but structural: returns rule nodes with parsed
// declarations instead of raw regex hits, so a later rule reads a declaration list once.

import { makePosAt } from './util.mjs';

const AT_RULE_WITH_BODY = /^@(media|supports|layer|keyframes|page|container|scope|document|-moz-document)\b/i;

export function scanCss(text) {
    const at = makePosAt(text);
    const stripped = stripCommentsAndKeepStrings(text);
    const nodes = [];
    parseBlock(stripped, 0, stripped.length, at, nodes);
    return { nodes };
}

// Blanks out comment bodies (preserving length and newlines, so offsets stay valid) and passes string
// contents through untouched, so a `{` or `;` inside a quoted value never confuses the block/declaration split.
function stripCommentsAndKeepStrings(text) {
    let out = '';
    const n = text.length;
    let i = 0;
    while (i < n) {
        if (text[i] === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            const stop = end === -1 ? n : end + 2;
            for (let j = i; j < stop; j++) out += text[j] === '\n' ? '\n' : ' ';
            i = stop;
            continue;
        }
        if (text[i] === '"' || text[i] === "'") {
            const quote = text[i];
            let j = i + 1;
            while (j < n && text[j] !== quote) { if (text[j] === '\\') j++; j++; }
            j = Math.min(j + 1, n);
            out += text.slice(i, j);
            i = j;
            continue;
        }
        out += text[i];
        i++;
    }
    return out;
}

function parseBlock(text, start, end, at, nodes) {
    let i = start;
    while (i < end) {
        while (i < end && /\s/.test(text[i])) i++;
        if (i >= end) break;
        if (text[i] === '}') { i++; continue; }
        const headStart = i;
        let depth = 0;
        while (i < end && !((text[i] === '{' || text[i] === ';') && depth === 0)) {
            if (text[i] === '"' || text[i] === "'") i = skipString(text, i);
            else if (text[i] === '(') { depth++; i++; }
            else if (text[i] === ')') { depth--; i++; }
            else i++;
        }
        const head = text.slice(headStart, i).trim();
        const pos = at(headStart);
        if (text[i] === '{') {
            const bodyStart = i + 1;
            const bodyEnd = matchBrace(text, i, end);
            const isAtRule = head.startsWith('@');
            if (head && isAtRule && AT_RULE_WITH_BODY.test(head)) {
                nodes.push({ kind: 'at-rule', name: head, line: pos.line, column: pos.column });
                parseBlock(text, bodyStart, bodyEnd - 1, at, nodes);
            } else if (head && isAtRule) {
                nodes.push({ kind: 'at-rule', name: head, line: pos.line, column: pos.column });
            } else if (head) {
                nodes.push({ kind: 'rule', name: head, declarations: parseDeclarations(text, bodyStart, bodyEnd - 1, at), line: pos.line, column: pos.column });
            }
            i = bodyEnd;
        } else {
            if (head) nodes.push({ kind: 'at-rule', name: head, line: pos.line, column: pos.column });
            i++;
        }
    }
}

function skipString(text, start) {
    const quote = text[start];
    let i = start + 1;
    while (i < text.length && text[i] !== quote) { if (text[i] === '\\') i++; i++; }
    return Math.min(i + 1, text.length);
}

function matchBrace(text, openIndex, end) {
    let depth = 0;
    for (let i = openIndex; i < end; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) return i + 1;
    }
    return end;
}

function parseDeclarations(text, start, end, at) {
    const out = [];
    let i = start;
    while (i < end) {
        while (i < end && /[\s;]/.test(text[i])) i++;
        if (i >= end) break;
        const declStart = i;
        let depth = 0;
        while (i < end && !(text[i] === ';' && depth === 0)) {
            if (text[i] === '"' || text[i] === "'") i = skipString(text, i);
            else if (text[i] === '(') { depth++; i++; }
            else if (text[i] === ')') { depth--; i++; }
            else i++;
        }
        const decl = text.slice(declStart, i);
        const colon = decl.indexOf(':');
        if (colon !== -1) {
            const pos = at(declStart);
            out.push({ property: decl.slice(0, colon).trim(), value: decl.slice(colon + 1).trim(), line: pos.line, column: pos.column });
        }
        i++;
    }
    return out;
}
