// Dependency-free HTML/Razor/JSX-template tag tokenizer (design section 4.1). No DOM, no npm parser: walks the
// text once and returns tag/component nodes plus every token seen, so rules are written against a uniform
// structure instead of ad hoc regexes. HTML comments and `<script>`/`<style>` bodies are raw text; Razor
// `@* *@` comments, `@{ }`/`@( )` blocks and bare `@expr` are skipped as opaque (their contents are not
// re-scanned here - a later Razor-aware rule reads `@code` blocks itself, per the design's section 7).
// Tags whose name starts uppercase, or with `Pk`, are recognised as components (JSX/Razor components).

import { makePosAt } from './util.mjs';

const RAW_TEXT_TAGS = new Set(['script', 'style']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const TAG_NAME_RE = /^[A-Za-z][A-Za-z0-9:_.-]*/;
const ATTR_NAME_RE = /^[^\s=/>"'<]+/;

const isComponentName = name => /^[A-Z]/.test(name) || /^Pk[A-Z]/.test(name);

export function scanHtml(text) {
    const at = makePosAt(text);
    const tokens = [];
    const nodes = [];
    const n = text.length;
    let i = 0;

    while (i < n) {
        if (text.startsWith('@*', i)) {
            const end = text.indexOf('*@', i + 2);
            const pos = at(i);
            tokens.push({ kind: 'razor-comment', line: pos.line, column: pos.column });
            i = end === -1 ? n : end + 2;
            continue;
        }
        if (text.startsWith('<!--', i)) {
            const end = text.indexOf('-->', i + 4);
            const pos = at(i);
            tokens.push({ kind: 'comment', line: pos.line, column: pos.column });
            i = end === -1 ? n : end + 3;
            continue;
        }
        if (text[i] === '@' && /[A-Za-z({]/.test(text[i + 1] || '')) {
            const razorEnd = readRazorExpression(text, i);
            if (razorEnd > i + 1) {
                const pos = at(i);
                tokens.push({ kind: 'razor-expr', line: pos.line, column: pos.column });
                i = razorEnd;
                continue;
            }
        }
        if (text[i] === '<') {
            const tag = readTag(text, i, at);
            if (tag) {
                tokens.push(tag.token);
                if (tag.node) nodes.push(tag.node);
                i = tag.end;
                if (tag.node && RAW_TEXT_TAGS.has(tag.node.name.toLowerCase()) && !tag.node.closing && !tag.node.selfClosing) {
                    const closeRe = new RegExp(`</${tag.node.name}\\s*>`, 'i');
                    const m = closeRe.exec(text.slice(i));
                    const pos = at(i);
                    tokens.push({ kind: 'raw', name: tag.node.name, line: pos.line, column: pos.column });
                    i = m ? i + m.index + m[0].length : n;
                }
                continue;
            }
        }
        const next = nextSpecialIndex(text, i + 1);
        const pos = at(i);
        tokens.push({ kind: 'text', line: pos.line, column: pos.column });
        i = next;
    }
    return { nodes, tokens };
}

function readTag(text, start, at) {
    let i = start + 1;
    let closing = false;
    if (text[i] === '/') { closing = true; i++; }
    const nameMatch = TAG_NAME_RE.exec(text.slice(i));
    if (!nameMatch) return null; // "<" not followed by a tag name: not a tag (e.g. "a < b")
    const name = nameMatch[0];
    i += name.length;
    const attrs = {};

    while (i < text.length && text[i] !== '>' && !text.startsWith('/>', i)) {
        while (i < text.length && /\s/.test(text[i])) i++;
        if (text[i] === '>' || text.startsWith('/>', i)) break;
        if (text[i] === '@') { i = readRazorAttr(text, i); continue; }
        const attrNameMatch = ATTR_NAME_RE.exec(text.slice(i));
        if (!attrNameMatch) { i++; continue; }
        const attrName = attrNameMatch[0];
        i += attrName.length;
        while (i < text.length && /\s/.test(text[i])) i++;
        let value = true;
        if (text[i] === '=') {
            i++;
            while (i < text.length && /\s/.test(text[i])) i++;
            const quote = text[i];
            if (quote === '"' || quote === "'") {
                const end = findAttrValueEnd(text, i + 1, quote);
                const stop = end === -1 ? text.length : end;
                value = text.slice(i + 1, stop);
                i = end === -1 ? stop : stop + 1;
            } else {
                const bare = /^[^\s>]+/.exec(text.slice(i));
                value = bare ? bare[0] : '';
                i += value.length;
            }
        }
        attrs[attrName] = value;
    }

    let selfClosing = false;
    if (text.startsWith('/>', i)) { selfClosing = true; i += 2; }
    else if (text[i] === '>') i += 1;
    else return null; // unterminated tag: give up rather than mis-scan the rest of the file

    const pos = at(start);
    const node = {
        kind: isComponentName(name) ? 'component' : 'tag',
        name,
        attrs,
        line: pos.line,
        column: pos.column,
        closing,
        selfClosing: selfClosing || VOID_TAGS.has(name.toLowerCase()),
    };
    return { end: i, node, token: { kind: 'tag', name, line: pos.line, column: pos.column } };
}

// Finds the index of the closing `quote` for a plain HTML attribute's value (e.g. `Class="..."`), starting
// just past the opening quote. A naive `text.indexOf(quote, from)` breaks on a well-known Razor/HTML gotcha
// (issue #719): a C# ternary or string literal embedded via `@(...)` may itself contain a quote of the same
// character the surrounding HTML attribute uses - `Class="@(Active ? "on" : "")"` is valid, common Razor, but
// its inner `"on"`/`""` would otherwise be mistaken for the attribute's own closing quote, truncating the
// value early and leaking the rest (`: "")"` and beyond) to be re-scanned as bogus markup/attributes - which
// is how a script-URI href or a plain string elsewhere in the file could end up misread as a stray tag. This
// walks the value looking only for a bare `quote`, treating any `@(...)`/`@{...}` run as one opaque unit (via
// `readRazorExpression`) so a same-character quote inside it is never mistaken for the value's end.
function findAttrValueEnd(text, from, quote) {
    let i = from;
    while (i < text.length) {
        if (text[i] === quote) return i;
        if (text[i] === '@' && /[A-Za-z({]/.test(text[i + 1] || '')) {
            const end = readRazorExpression(text, i);
            if (end > i + 1) { i = end; continue; }
        }
        i++;
    }
    return -1;
}

// A Razor attribute directive inside a tag's attribute list (`start` points at the `@`): `@onclick="..."`,
// `@ref="x"`, `@bind-Value="Foo"`, or one of Blazor's two-way bind suffixes, `@bind-Value:get="..."` /
// `@bind-Value:set="..."` / `@bind-Value:after="..."` (the directive name itself may contain `-` and `:`,
// which a plain HTML attribute name never does). Consumes the whole `@name="value"` (or `@name='value'` /
// `@name=bare`) as one opaque unit and returns the index just past it - critically, past the value too, so a
// `=>` lambda, a generic `TItem="..."` fragment, or a non-ASCII character inside the quoted value is never
// left dangling for the generic attribute-name matcher to misread as a separate attribute (issue #686: that
// dangling remainder is what produced garbage findings like `ValueChanged=`, `-Value=`, `)=`, `:=`, `—=`).
// Not a directive+value shape (e.g. a bare `@identifier`, or `@(expr)`/`@{ block }` used as a value)? Falls
// back to the general Razor-expression skip used elsewhere in this scanner.
function readRazorAttr(text, start) {
    let i = start + 1;
    const idMatch = /^[A-Za-z_][A-Za-z0-9_.]*(?:-[A-Za-z0-9_.]+)*(?::[A-Za-z0-9_.]+)*/.exec(text.slice(i));
    if (!idMatch) {
        const end = readRazorExpression(text, start);
        return end > start + 1 ? end : start + 1;
    }
    i += idMatch[0].length;
    let probe = i;
    while (probe < text.length && /\s/.test(text[probe])) probe++;
    if (text[probe] === '=') {
        probe++;
        while (probe < text.length && /\s/.test(text[probe])) probe++;
        const quote = text[probe];
        if (quote === '"' || quote === "'") {
            const end = findAttrValueEnd(text, probe + 1, quote);
            return end === -1 ? text.length : end + 1;
        }
        const bare = /^[^\s>]+/.exec(text.slice(probe));
        return bare ? probe + bare[0].length : probe;
    }
    if (text[probe] === '(') return skipBalanced(text, probe, '(', ')');
    if (text[probe] === '{') return skipBalanced(text, probe, '{', '}');
    return i;
}

// `@{ ... }`, `@( ... )`, `@code { ... }`, or a bare `@identifier` (no following block): returns the end index,
// or start+1 (nothing consumed beyond the `@`) when it is not one of these shapes.
function readRazorExpression(text, start) {
    let i = start + 1;
    const idMatch = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(text.slice(i));
    if (idMatch) i += idMatch[0].length;
    let probe = i;
    while (probe < text.length && /\s/.test(text[probe])) probe++;
    if (text[probe] === '(') { i = skipBalanced(text, probe, '(', ')'); probe = i; while (probe < text.length && /\s/.test(text[probe])) probe++; }
    if (text[probe] === '{') i = skipBalanced(text, probe, '{', '}');
    return i;
}

function skipBalanced(text, start, open, close) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === open) depth++;
        else if (text[i] === close && --depth === 0) return i + 1;
    }
    return text.length;
}

function nextSpecialIndex(text, from) {
    for (let i = from; i < text.length; i++) if (text[i] === '<' || text[i] === '@') return i;
    return text.length;
}
