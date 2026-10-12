// Layout model, part 4 of 5: the document as HTML (toHtml) and sanitised HTML back into a document (fromHtml). See js/layout-model.js.

import { LIMITS, MODEL_VERSION, NODE_ID, ATTR_NAME, SLOT_NAME, FORBIDDEN, PRESERVE, PHRASING, VOID, RAW_TEXT, RESERVED_ID_ATTR, CONTROL_G, B, has, attrInfo, valueProblem, slotExists, isText, tidy, problem, orderSlots, emptyDoc } from './layout-schema.js';
import { impliedCut } from './layout-validate.js';

const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');

/** The document as HTML: pk-* elements and allow-listed native tags only, double-quoted attributes, escaped text, no script, style or ids
 *  (`ids: true` adds data-lb-id, which fromHtml reads back with `ids: true`). `compact: true` writes one line with no added whitespace. */
export function toHtml(doc, { ids = false, compact = false, indent = '  ' } = {}) {
    const attrs = (node, slotName) => {
        let out = '';
        if (ids) out += ` ${RESERVED_ID_ATTR}="${node.id}"`;
        if (slotName) out += ` slot="${escAttr(slotName)}"`;
        for (const [k, v] of Object.entries(node.props)) out += v === true ? ` ${k}` : ` ${k}="${escAttr(v)}"`;
        return out;
    };
    // Each child with the slot it sits in: default slot first, then the named slots.
    const kids = node => Object.entries(node.slots).flatMap(([slot, list]) => list.map(c => [c, slot]));
    const inline = node => Object.values(node.slots).flat().some(c => isText(c) || (c.tag && PHRASING.has(c.tag))) || PRESERVE.has(node.tag);
    function one(node, slotName, level, forceInline) {
        const open = `<${node.tag}${attrs(node, slotName)}>`;
        if (VOID.has(node.tag)) return open;
        const children = kids(node);
        if (!children.length) return `${open}</${node.tag}>`;
        const flow = compact || forceInline || inline(node);
        if (flow) return `${open}${children.map(([c, s]) => (isText(c) ? escText(c) : one(c, s, level + 1, true))).join('')}</${node.tag}>`;
        const pad = indent.repeat(level + 1);
        return `${open}\n${children.map(([c, s]) => pad + one(c, s, level + 1, false)).join('\n')}\n${indent.repeat(level)}</${node.tag}>`;
    }
    return doc.nodes.map(n => one(n, '', 0, false)).join(compact ? '' : '\n');
}

// ---------------------------------------------------------------- HTML in

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', bull: '•', middot: '·' };
function decode(text, problems, path) {
    return text.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z0-9]{1,8});/g, (m, body) => {
        if (body[0] === '#') {
            const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) || (cp < 0x20 && cp !== 9 && cp !== 10 && cp !== 13) || cp === 0x7f) { problems.push(problem('entity', `the character reference ${m} is not allowed`, { path, severity: 'error' })); return ''; }
            return String.fromCodePoint(cp);
        }
        if (has(NAMED, body)) return NAMED[body];
        problems.push(problem('entity', `the named reference ${m} is not supported: kept as text`, { path, severity: 'warn' }));
        return m;
    });
}

class Limit extends Error {}

// The markup as a raw tree: { tag, attrs: [[name, value|null]], children, path }; text stays as strings. Comments and doctypes are dropped, raw-text elements
// (script, style, ...) keep no content. Well-formed markup is expected (what toHtml writes); a stray or missing end tag is reported.
function parseRaw(source, problems) {
    const root = { tag: '#root', attrs: [], children: [], path: '' };
    const stack = [root];
    let nodes = 0;
    const text = (s) => {
        if (!s) return;
        const where = stack.map(e => e.tag).slice(1).join(' > ');
        let t = decode(s.replace(/\r\n?/g, '\n'), problems, where);
        if (CONTROL_G.test(t)) { problems.push(problem('text-control', 'control characters in text were dropped', { path: where, severity: 'warn' })); t = t.replace(CONTROL_G, ''); }
        if (t) stack.at(-1).children.push(t);
    };
    let i = 0;
    while (i < source.length) {
        const lt = source.indexOf('<', i);
        if (lt < 0) { text(source.slice(i)); break; }
        text(source.slice(i, lt));
        i = lt;
        if (source.startsWith('<!--', i)) { const e = source.indexOf('-->', i + 4); if (e < 0) { problems.push(problem('comment', 'a comment is never closed: the rest was dropped')); break; } i = e + 3; continue; }
        if (source[i + 1] === '!' || source[i + 1] === '?') { const e = source.indexOf('>', i); if (e < 0) break; i = e + 1; continue; }
        if (source[i + 1] === '/') {
            const m = /^<\/([A-Za-z][\w:.-]*)[^>]*>/.exec(source.slice(i, i + 300));
            if (!m) { text('<'); i += 1; continue; }
            const name = m[1].toLowerCase();
            let at = -1;
            for (let k = stack.length - 1; k >= 1; k--) if (stack[k].tag === name) { at = k; break; }
            if (at < 0) problems.push(problem('stray-close', `</${name}> closes nothing`, { path: stack.map(e => e.tag).slice(1).join(' > ') }));
            else {
                for (const el of stack.slice(at + 1)) if (!['p', 'li', 'option', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot'].includes(el.tag)) problems.push(problem('unclosed', `<${el.tag}> is not closed before </${name}>`, { path: el.path, severity: 'warn' }));
                stack.length = at;
            }
            i += m[0].length; continue;
        }
        const nameM = /^<([A-Za-z][\w:.-]*)/.exec(source.slice(i, i + 200));
        if (!nameM) { text('<'); i += 1; continue; }
        const tag = nameM[1].toLowerCase();
        let j = i + nameM[0].length;
        const attrs = [];
        let selfClose = false, closed = false;
        while (j < source.length) {
            while (j < source.length && /\s/.test(source[j])) j++;
            if (source[j] === '>') { j++; closed = true; break; }
            if (source[j] === '/' && source[j + 1] === '>') { selfClose = true; j += 2; closed = true; break; }
            if (source[j] === '/') { j++; continue; }
            const a = /^[^\s=\/>"'<]+/.exec(source.slice(j, j + 400));
            if (!a) { j++; continue; }
            j += a[0].length;
            while (j < source.length && /\s/.test(source[j])) j++;
            let value = null;
            if (source[j] === '=') {
                j++;
                while (j < source.length && /\s/.test(source[j])) j++;
                const q = source[j];
                if (q === '"' || q === "'") { const e = source.indexOf(q, j + 1); if (e < 0) { j = source.length; break; } value = source.slice(j + 1, e); j = e + 1; }
                else { const u = /^[^\s>]*/.exec(source.slice(j)); value = u[0]; j += u[0].length; }
            }
            attrs.push([a[0].toLowerCase(), value === null ? null : decode(value, problems, tag)]);
        }
        if (!closed) { problems.push(problem('unterminated', `the tag <${tag}> is never finished: the rest was dropped`)); break; }
        i = j;
        stack.length = impliedCut(stack.map(e => e.tag), tag);
        if (++nodes > LIMITS.nodes * 2) throw new Limit('too-many-nodes');
        const el = { tag, attrs, children: [], path: [...stack.map(e => e.tag).slice(1), tag].join(' > ') };
        stack.at(-1).children.push(el);
        if (RAW_TEXT.has(tag) && !selfClose) {
            const e = source.toLowerCase().indexOf(`</${tag}`, i);
            const end = e < 0 ? source.length : source.indexOf('>', e);
            i = e < 0 || end < 0 ? source.length : end + 1;
            continue;
        }
        if (!selfClose && !VOID.has(tag)) { stack.push(el); if (stack.length - 1 > LIMITS.depth + 1) throw new Limit('too-deep'); }
    }
    for (const el of stack.slice(1)) if (!['p', 'li', 'option', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot'].includes(el.tag)) problems.push(problem('unclosed', `<${el.tag}> is never closed`, { path: el.path, severity: 'warn' }));
    return root;
}

/** Sanitised HTML in: { doc, problems }. The document only holds what passed (real elements, real props, real slots, safe values); what was refused is in problems.
 *  options: registry (required), ids (read data-lb-id back, for a page the builder exported with ids: true). */
export function fromHtml(source, { registry, ids = false } = {}) {
    if (!registry) throw new TypeError('fromHtml: a registry is required');
    const problems = [];
    const text = typeof source === 'string' ? source : '';
    if (typeof source !== 'string') problems.push(problem('input', 'the markup must be text'));
    if (text.length > LIMITS.input) return { doc: emptyDoc(), problems: [problem('too-large', `the markup is longer than ${LIMITS.input} characters`)] };
    let raw;
    try { raw = parseRaw(text, problems); }
    catch (error) {
        if (!(error instanceof Limit)) throw error;
        return { doc: emptyDoc(), problems: [...problems, problem(error.message, error.message === 'too-deep' ? `nested deeper than ${LIMITS.depth} levels` : 'too many elements')] };
    }
    const claimed = new Set();
    let count = 0;
    const convert = (children, parent, preserveIn, depth) => {
        const slots = {};
        const put = (slot, c) => { (slots[slot] ??= []).push(c); };
        for (const c of children) {
            if (isText(c)) { if (parent) put('', c); else if (c.trim()) problems.push(problem('text-outside', 'text outside any element was dropped')); continue; }
            const entry = registry.entry(c.tag);
            if (!entry) { problems.push(problem(FORBIDDEN.has(c.tag) ? 'forbidden-tag' : 'unknown-tag', FORBIDDEN.has(c.tag) ? `<${c.tag}> is not allowed and was dropped with its content` : `unknown element <${c.tag}> was dropped with its content`, { path: c.path })); continue; }
            if (++count > LIMITS.nodes) { if (count === LIMITS.nodes + 1) problems.push(problem('too-many-nodes', `more than ${LIMITS.nodes} elements: the rest was dropped`, { path: c.path })); continue; }
            if (depth > LIMITS.depth) { problems.push(problem('too-deep', `nested deeper than ${LIMITS.depth} levels`, { path: c.path })); continue; }
            const props = {};
            let slot = '', claim = null, dropped = false;
            for (const [name, value] of c.attrs) {
                if (name === 'slot') {
                    slot = value ?? '';
                    if (!SLOT_NAME.test(slot)) { problems.push(problem('slot-name', `"${slot}" is not a valid slot name`, { path: c.path })); dropped = true; }
                    continue;
                }
                if (name === RESERVED_ID_ATTR) { if (ids && value && NODE_ID.test(value) && !claimed.has(value)) { claimed.add(value); claim = value; } else if (!ids) problems.push(problem('reserved', `${RESERVED_ID_ATTR} is the builder's own attribute and was dropped`, { path: c.path, severity: 'warn' })); continue; }
                if (name === 'style') { problems.push(problem('style-attribute', `<${c.tag}> has a style attribute: dropped`, { path: c.path })); continue; }
                if (/^on/.test(name) && !entry.props.has(name)) { problems.push(problem('event-attribute', `<${c.tag}> has an event handler attribute "${name}": dropped`, { path: c.path })); continue; }
                if (!ATTR_NAME.test(name)) { problems.push(problem('prop-name', `"${name}" is not a valid attribute name: dropped`, { path: c.path })); continue; }
                if (has(props, name)) { problems.push(problem('duplicate-attribute', `<${c.tag}> repeats "${name}": the first was kept`, { path: c.path, severity: 'warn' })); continue; }
                const info = attrInfo(entry, name);
                if (!info) { problems.push(problem('unknown-prop', `<${c.tag}> has no prop "${name}": dropped`, { path: c.path })); continue; }
                const v = info.type === B ? true : value === null ? '' : value;
                const why = valueProblem(name, info, v);
                if (why) { problems.push(problem('bad-value', `<${c.tag}> ${name} ${why}: dropped`, { path: c.path })); continue; }
                props[name] = v;
            }
            if (slot !== '') {
                if (!parent) { problems.push(problem('slot-parent', `<${c.tag} slot="${slot}"> has no parent element: the slot was ignored`, { path: c.path, severity: 'warn' })); slot = ''; }
                else if (parent.native) { problems.push(problem('unknown-slot', `<${parent.tag}> has no slot "${slot}": <${c.tag}> was dropped`, { path: c.path })); dropped = true; }
                else if (!slotExists(parent, slot)) { problems.push(problem('unknown-slot', `<${parent.tag}> has no slot "${slot}" (it has: ${parent.slots.map(s => s.name || '(default)').join(', ')}): <${c.tag}> was dropped`, { path: c.path })); dropped = true; }
            }
            if (dropped) continue;
            const keep = preserveIn || PRESERVE.has(c.tag);
            const inner = convert(c.children, entry, keep, depth + 1);
            const kids = {};
            for (const [k, list] of Object.entries(inner)) { const t = k === '' ? tidy(list, keep) : list; if (t.length) kids[k] = t; }
            if (entry.void && Object.keys(kids).length) { problems.push(problem('void-content', `<${c.tag}> cannot have content: dropped`, { path: c.path })); for (const k of Object.keys(kids)) delete kids[k]; }
            if (!entry.native && kids[''] && !entry.slots.some(s => s.name === '') && kids[''].some(k => !isText(k))) problems.push(problem('no-default-slot', `<${c.tag}> declares no default slot, so its child elements have nowhere to go`, { path: c.path, severity: 'warn' }));
            put(slot, { id: claim, tag: c.tag, props, slots: orderSlots(kids) });
        }
        return slots;
    };
    const top = convert(raw.children, null, false, 1);
    const doc = { version: MODEL_VERSION, seq: 1, nodes: top[''] ?? [] };
    // Ids: the claimed ones stay, the rest are numbered after the highest, in document order.
    let next = Math.max(0, ...[...claimed].map(id => Number(id.slice(1)))) + 1;
    const number = list => { for (const c of list) if (!isText(c)) { if (c.id === null) c.id = `n${next++}`; for (const kids of Object.values(c.slots)) number(kids); } };
    number(doc.nodes);
    doc.seq = next;
    if (!ids) { let n = 1; const renumber = list => { for (const c of list) if (!isText(c)) { c.id = `n${n++}`; for (const kids of Object.values(c.slots)) renumber(kids); } }; renumber(doc.nodes); doc.seq = n; }
    return { doc: canonical(doc), problems };
}

// Key order the rest of the code relies on: id, tag, props, slots.
function canonical(doc) {
    const fix = c => (isText(c) ? c : { id: c.id, tag: c.tag, props: c.props, slots: Object.fromEntries(Object.entries(c.slots).map(([k, v]) => [k, v.map(fix)])) });
    return { version: doc.version, seq: doc.seq, nodes: doc.nodes.map(fix) };
}
