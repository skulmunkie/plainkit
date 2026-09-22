// The layout builder's document model: a JSON tree of Plainkit elements, checked against the element API, converted to and from safe HTML, edited by pure
// operations and undone by a small history. No DOM, no side effects, no logging: everything returns data (documents and problem lists), so node tests
// cover it and any host (the browser module, the Blazor wrapper, a build script) can use it. The reasoning is in modules/layout-builder/DESIGN.md.
//
//   const registry = createRegistry(api);                          // api: the array in dist/elements/api.json
//   let { doc } = insertNode(emptyDoc(), { node: { tag: 'pk-card', props: { heading: 'Hi' }, text: 'Body' } }, registry);
//   const html = toHtml(doc);                                       // '<pk-card heading="Hi">Body</pk-card>' (indented; { compact: true } for one line)
//   const { doc: again, problems } = fromHtml(html, { registry });  // sanitised: what was refused is listed in problems, what is kept is valid
//   const history = createHistory(doc); history.push(next, 'prop:n1:heading'); history.undo();
//
// A document is { version, seq, nodes }; a node is { id, tag, props, slots }: props map an attribute name to a string (or true for a boolean attribute),
// slots map a slot name ('' is the default slot) to children, a child is a node or a string of text. Text lives only in the default slot. Ids are "n<number>"
// from the document's seq counter, never reused. A problem is { code, severity: 'error' | 'warn', message, id?, path }.
//
// Guarantees (property-tested): fromJson(toJson(doc)) equals doc; fromHtml(toHtml(doc, { ids: true }), { ids: true }) equals doc (the seq counter aside);
// toHtml(fromHtml(html)) is a fixed point; fromHtml always returns a document with no error problems, whatever the input.

export const MODEL_VERSION = 1;
export const LIMITS = { depth: 32, nodes: 5000, value: 10000, text: 100000, input: 2000000 };

export const kebab = s => String(s).replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ---------------------------------------------------------------- what may exist: pk-* elements from the API, and native content tags

const S = 'string', B = 'boolean', N = 'number';
const NATIVE = {
    h1: {}, h2: {}, h3: {}, h4: {}, h5: {}, h6: {}, p: {}, div: {}, span: {}, section: {}, article: {}, aside: {}, header: {}, footer: {}, main: {}, nav: {},
    ul: {}, ol: { start: N, reversed: B }, li: { value: N }, dl: {}, dt: {}, dd: {}, blockquote: { cite: S }, pre: {}, figure: {}, figcaption: {},
    a: { href: S, target: S, rel: S, download: S }, strong: {}, em: {}, b: {}, i: {}, u: {}, small: {}, code: {}, kbd: {}, mark: {}, sub: {}, sup: {},
    abbr: {}, cite: {}, q: { cite: S }, time: { datetime: S }, label: { for: S }, br: {}, hr: {},
    img: { src: S, alt: S, width: N, height: N, loading: ['lazy', 'eager'] },
    table: {}, caption: {}, thead: {}, tbody: {}, tfoot: {}, tr: {}, th: { colspan: N, rowspan: N, scope: ['row', 'col', 'rowgroup', 'colgroup'] }, td: { colspan: N, rowspan: N },
    input: { type: ['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'checkbox', 'radio', 'date', 'time', 'range', 'color'], name: S, value: S, placeholder: S, checked: B, disabled: B, readonly: B, required: B, min: S, max: S, step: S, minlength: N, maxlength: N, pattern: S, autocomplete: S },
    option: { value: S, selected: B, disabled: B, label: S }, button: { type: ['button', 'submit', 'reset'], disabled: B, name: S, value: S },
};
const VOID = new Set(['br', 'hr', 'img', 'input']);
const PHRASING = new Set(['a', 'span', 'strong', 'em', 'b', 'i', 'u', 'small', 'code', 'kbd', 'mark', 'sub', 'sup', 'abbr', 'cite', 'q', 'time', 'label', 'br', 'img', 'button', 'input']);
const BLOCKS = new Set(['div', 'p', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'pre', 'hr', 'section', 'article', 'blockquote', 'dl', 'figure', 'header', 'footer', 'main', 'nav', 'aside']);
const PRESERVE = new Set(['pre', 'pk-code-block', 'pk-textarea']);
// Named so the message for a hostile tag says what it is; anything else that is not in the registry is just unknown.
const FORBIDDEN = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'template', 'noscript', 'svg', 'math', 'frame', 'frameset', 'applet', 'textarea', 'title']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript', 'iframe']);
const URL_ATTRS = new Set(['href', 'src', 'cite', 'action', 'formaction', 'poster', 'srcset', 'data', 'manifest', 'ping']);
const URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const RESERVED_ID_ATTR = 'data-lb-id';

/** The registry the model checks against: { entry(tag), has(tag), tags() }. `api` is the element API array (dist/elements/api.json). */
export function createRegistry(api = []) {
    const entries = new Map();
    for (const meta of Array.isArray(api) ? api : []) {
        if (!meta || typeof meta.tag !== 'string') continue;
        const props = new Map();
        for (const p of meta.props ?? []) props.set(kebab(p.name), { name: p.name, type: p.type, values: p.values ?? null });
        const slots = (meta.slots ?? []).map(s => ({ name: s.name ?? '', dynamic: Boolean(s.dynamic) }));
        entries.set(meta.tag, { tag: meta.tag, native: false, meta, props, slots, void: false, phrasing: false });
    }
    for (const [tag, attrs] of Object.entries(NATIVE)) {
        const props = new Map(Object.entries(attrs).map(([name, t]) => [name, Array.isArray(t) ? { name, type: 'enum', values: t } : { name, type: t, values: null }]));
        entries.set(tag, { tag, native: true, meta: null, props, slots: [{ name: '', dynamic: false }], void: VOID.has(tag), phrasing: PHRASING.has(tag) });
    }
    return {
        entry: tag => entries.get(tag) ?? null,
        has: tag => entries.has(tag),
        tags: () => [...entries.keys()].filter(t => t.startsWith('pk-')).sort(),
        nativeTags: () => Object.keys(NATIVE),
    };
}

// The type of an attribute on an element: its own props first, then the global attributes any element takes.
function attrInfo(entry, name) {
    const own = entry.props.get(name);
    if (own) return own;
    if (name === 'id' || name === 'class' || name === 'title' || name === 'lang' || name === 'role') return { name, type: S, values: null };
    if (name === 'dir') return { name, type: 'enum', values: ['ltr', 'rtl', 'auto'] };
    if (name === 'hidden') return { name, type: B, values: null };
    if (name === 'tabindex') return { name, type: N, values: null };
    if (/^(aria|data)-[a-z][a-z0-9-]*$/.test(name) && name !== RESERVED_ID_ATTR) return { name, type: S, values: null };
    return null;
}

const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const CONTROL_G = new RegExp(CONTROL.source, 'g');
const ID_VALUE = /^[A-Za-z][\w:.-]*$/;
const CLASS_VALUE = /^[\w:./%@-]+(?: [\w:./%@-]+)*$/;
const SLOT_NAME = /^(?:[A-Za-z][\w.-]*)?$/;
const NODE_ID = /^n[1-9]\d*$/;
const ATTR_NAME = /^[a-z][a-z0-9:._-]*$/;

/** null when `value` is fine for the attribute, else the reason. */
export function valueProblem(name, info, value) {
    if (info.type === B) return value === true ? null : 'a boolean attribute is written without a value';
    if (typeof value !== 'string') return 'needs a text value';
    if (value.length > LIMITS.value) return `is longer than ${LIMITS.value} characters`;
    if (CONTROL.test(value)) return 'contains a control character';
    if (info.type === 'enum' && !info.values.includes(value)) return `is not one of ${info.values.join('|')}`;
    if (info.type === N && (value.trim() === '' || !Number.isFinite(Number(value)))) return 'is not a number';
    if (info.type === 'json') { try { JSON.parse(value); } catch (error) { return `is not valid JSON (${error.message})`; } }
    if (URL_ATTRS.has(name)) {
        const bare = value.replace(/[\x00-\x20\x7f-\x9f]/g, '');
        const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(bare);
        if (scheme && !URL_SCHEMES.has(scheme[1].toLowerCase())) return `uses the "${scheme[1]}:" scheme, which is not allowed (http, https, mailto and tel are)`;
    }
    if (name === 'id' && !ID_VALUE.test(value)) return 'is not a valid id';
    if (name === 'class' && value !== '' && !CLASS_VALUE.test(value)) return 'is not a list of class names';
    return null;
}

function slotExists(entry, name) {
    if (entry.slots.some(s => s.name === name)) return true;
    return entry.slots.some(s => s.dynamic && new RegExp('^' + s.name.replace(/<[^>]+>/g, '[\\w.-]+') + '$').test(name));
}

// ---------------------------------------------------------------- text form

const isText = c => typeof c === 'string';
const collapse = s => s.replace(/\r\n?/g, '\n').replace(/[ \t\n\f]+/g, ' ');

// The canonical form of a child list: adjacent text merged, whitespace collapsed to one space, formatting whitespace (a run with a line break, on its own) dropped,
// the edges trimmed. In preserved content (pre, code blocks) text is only merged. What toHtml writes and fromHtml reads are the same canonical form.
function tidy(list, preserve) {
    const merged = [];
    for (const c of list) {
        if (isText(c) && isText(merged.at(-1))) merged[merged.length - 1] += c; else merged.push(c);
    }
    if (preserve) return merged.filter(c => c !== '');
    const out = [];
    for (const c of merged) {
        if (!isText(c)) { out.push(c); continue; }
        if (/^[ \t\r\n\f]*$/.test(c)) { if (!/[\r\n]/.test(c) && c !== '') out.push(' '); continue; }
        out.push(collapse(c));
    }
    if (isText(out[0])) { out[0] = out[0].replace(/^ /, ''); if (out[0] === '') out.shift(); }
    if (isText(out.at(-1))) { out[out.length - 1] = out.at(-1).replace(/ $/, ''); if (out.at(-1) === '') out.pop(); }
    // A lone space between two texts cannot exist (they merged); one at an edge was trimmed; one left between elements is kept.
    return out;
}

/** The canonical form of text a user typed: whitespace collapsed to single spaces, trimmed. */
export const normalizeText = text => collapse(String(text ?? '')).trim();

// ---------------------------------------------------------------- documents

export const emptyDoc = () => ({ version: MODEL_VERSION, seq: 1, nodes: [] });

const orderSlots = slots => {
    const out = {};
    if (slots['']?.length) out[''] = slots[''];
    for (const [k, v] of Object.entries(slots)) if (k !== '' && v.length) out[k] = v;
    return out;
};

const propsFrom = raw => {
    const props = {};
    for (const [k, v] of Object.entries(raw ?? {})) {
        if (v === false || v === undefined || v === null) continue;
        props[k] = v === true ? true : typeof v === 'number' ? String(v) : String(v);
    }
    return props;
};

// A spec is { tag, props?, slots?, children?, text? } (or a string of text); it becomes nodes with fresh ids from the seq object. `children` and `text` are
// shorthand for the default slot. Text is normalised.
function build(spec, seq, preserve = false) {
    if (isText(spec)) return spec;
    if (!spec || typeof spec !== 'object' || typeof spec.tag !== 'string') throw new ModelError('bad-node', 'a node needs a tag', []);
    const slots = {};
    for (const [name, kids] of Object.entries(spec.slots ?? {})) slots[name] = [...kids];
    if (spec.children) slots[''] = [...(slots[''] ?? []), ...spec.children];
    if (spec.text !== undefined && spec.text !== null && spec.text !== '') slots[''] = [String(spec.text), ...(slots[''] ?? [])];
    const id = `n${seq.n++}`;
    const keep = preserve || PRESERVE.has(spec.tag);
    const ordered = {};
    for (const [name, kids] of Object.entries(orderSlots(slots))) {
        const built = kids.map(k => build(k, seq, keep));
        const list = name === '' ? tidy(built, keep) : built;
        if (list.length) ordered[name] = list;
    }
    return { id, tag: spec.tag, props: propsFrom(spec.props), slots: orderSlots(ordered) };
}

/** Nodes for one or several specs with fresh ids: { doc, nodes } where doc has the advanced seq counter. */
export function assignIds(doc, specs) {
    const seq = { n: doc.seq };
    const nodes = specs.map(s => build(s, seq));
    return { doc: { ...doc, seq: seq.n }, nodes };
}

export class ModelError extends Error {
    constructor(code, message, problems) { super(message); this.name = 'ModelError'; this.code = code; this.problems = problems ?? []; }
}

/** Visit every node in document order: fn(node, { parent, slot, index, depth }). Return false to skip the node's children. */
export function walk(doc, fn) {
    const go = (list, parent, slotName, depth) => {
        list.forEach((child, index) => {
            if (isText(child)) return;
            if (fn(child, { parent, slot: slotName, index, depth }) === false) return;
            for (const [s, kids] of Object.entries(child.slots)) go(kids, child, s, depth + 1);
        });
    };
    go(doc.nodes, null, null, 0);
}

/** { node, parent, slot, index, depth } of the node with this id, or null. */
export function locate(doc, id) {
    let found = null;
    walk(doc, (node, at) => { if (found) return false; if (node.id === id) { found = { node, ...at }; return false; } return undefined; });
    return found;
}

export const findNode = (doc, id) => locate(doc, id)?.node ?? null;

/** Every node in document order. */
export function flatten(doc) { const out = []; walk(doc, n => { out.push(n); }); return out; }

/** The document without ids and the seq counter: what two documents must share to be "the same page". */
export function stripIds(doc) {
    const strip = c => (isText(c) ? c : { tag: c.tag, props: c.props, slots: Object.fromEntries(Object.entries(c.slots).map(([k, v]) => [k, v.map(strip)])) });
    return { version: doc.version, nodes: doc.nodes.map(strip) };
}
export const equalDocs = (a, b, { ids = false } = {}) => (ids ? JSON.stringify({ ...a, seq: 0 }) === JSON.stringify({ ...b, seq: 0 }) : JSON.stringify(stripIds(a)) === JSON.stringify(stripIds(b)));

const problem = (code, message, extra = {}) => ({ code, severity: extra.severity ?? 'error', message, ...(extra.id ? { id: extra.id } : {}), path: extra.path ?? '' });
export const errorsOf = problems => problems.filter(p => p.severity === 'error');

// ---------------------------------------------------------------- validation

/** Problems in a document: the API checks (real tag, prop, slot, enum value, number, JSON, no style, no handlers) plus structure, text form and limits. */
export function validateDoc(doc, registry) {
    const problems = [];
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [problem('shape', 'the document must be an object')];
    for (const k of Object.keys(doc)) if (!['version', 'seq', 'nodes'].includes(k)) problems.push(problem('unknown-field', `the document has an unknown field "${k}"`));
    if (doc.version !== MODEL_VERSION) problems.push(problem('version', `version must be ${MODEL_VERSION}`));
    if (!Number.isInteger(doc.seq) || doc.seq < 1) problems.push(problem('seq', 'seq must be a positive integer'));
    if (!Array.isArray(doc.nodes)) return [...problems, problem('shape', 'nodes must be an array')];
    const ctx = { registry, problems, ids: new Set(), count: 0, seq: doc.seq };
    doc.nodes.forEach((n, i) => checkNode(n, null, `nodes[${i}]`, 1, ctx, false, []));
    return problems;
}

function checkNode(node, parent, path, depth, ctx, preserve, trail) {
    const { problems, registry } = ctx;
    if (!node || typeof node !== 'object' || Array.isArray(node)) { problems.push(problem('shape', 'a node must be an object', { path })); return; }
    if (++ctx.count > LIMITS.nodes) { if (ctx.count === LIMITS.nodes + 1) problems.push(problem('too-many-nodes', `more than ${LIMITS.nodes} nodes`, { path })); return; }
    if (depth > LIMITS.depth) { problems.push(problem('too-deep', `nested deeper than ${LIMITS.depth} levels`, { path, id: node.id })); return; }
    for (const k of Object.keys(node)) if (!['id', 'tag', 'props', 'slots'].includes(k)) problems.push(problem('unknown-field', `a node has an unknown field "${k}"`, { path, id: node.id }));
    const at = { path, id: typeof node.id === 'string' ? node.id : undefined };
    if (typeof node.id !== 'string' || !NODE_ID.test(node.id)) problems.push(problem('id', 'a node id must look like n1, n2, ...', at));
    else if (ctx.ids.has(node.id)) problems.push(problem('id-duplicate', `the id ${node.id} is used twice`, at));
    else { ctx.ids.add(node.id); if (Number(node.id.slice(1)) >= ctx.seq) problems.push(problem('id-seq', `the id ${node.id} is not below seq ${ctx.seq}`, at)); }
    if (typeof node.tag !== 'string') { problems.push(problem('tag', 'a node needs a tag', at)); return; }
    const entry = registry.entry(node.tag);
    if (entry && impliedCut(['#root', ...trail], node.tag) < trail.length + 1) problems.push(problem('content-model', `<${node.tag}> cannot be here: HTML would close an open element first (a <p> before a block, an <li> before another <li>, ...)`, at));
    if (!entry) {
        problems.push(problem(FORBIDDEN.has(node.tag) ? 'forbidden-tag' : 'unknown-tag', FORBIDDEN.has(node.tag) ? `<${node.tag}> is not allowed` : `unknown element <${node.tag}>`, at));
        return;
    }
    if (!node.props || typeof node.props !== 'object' || Array.isArray(node.props)) problems.push(problem('shape', 'props must be an object', at));
    else {
        for (const [name, value] of Object.entries(node.props)) {
            if (name === 'style') { problems.push(problem('style-attribute', `<${node.tag}> has a style attribute`, at)); continue; }
            if (/^on/.test(name) && !entry.props.has(name)) { problems.push(problem('event-attribute', `<${node.tag}> has an event handler attribute "${name}"`, at)); continue; }
            if (name === 'slot') { problems.push(problem('slot-prop', 'the slot is the child\'s position in its parent, not a prop', at)); continue; }
            if (!ATTR_NAME.test(name)) { problems.push(problem('prop-name', `"${name}" is not a valid attribute name`, at)); continue; }
            const info = attrInfo(entry, name);
            if (!info) { problems.push(problem('unknown-prop', `<${node.tag}> has no prop "${name}"`, at)); continue; }
            const why = valueProblem(name, info, value);
            if (why) problems.push(problem('bad-value', `<${node.tag}> ${name} ${why}`, at));
        }
    }
    if (!node.slots || typeof node.slots !== 'object' || Array.isArray(node.slots)) { problems.push(problem('shape', 'slots must be an object', at)); return; }
    const keep = preserve || PRESERVE.has(node.tag);
    for (const [name, kids] of Object.entries(node.slots)) {
        const sat = { path: `${path}.slots[${JSON.stringify(name)}]`, id: at.id };
        if (!SLOT_NAME.test(name)) { problems.push(problem('slot-name', `"${name}" is not a valid slot name`, sat)); continue; }
        if (!Array.isArray(kids) || kids.length === 0) { problems.push(problem('shape', 'a slot must be a non-empty array (an empty slot is left out)', sat)); continue; }
        if (name !== '' && entry.native) problems.push(problem('unknown-slot', `<${node.tag}> has no slot "${name}"`, sat));
        else if (name !== '' && !slotExists(entry, name)) problems.push(problem('unknown-slot', `<${node.tag}> has no slot "${name}" (it has: ${entry.slots.map(s => s.name || '(default)').join(', ')})`, sat));
        if (name === '' && !entry.native && !entry.slots.some(s => s.name === '') && kids.some(k => !isText(k))) problems.push(problem('no-default-slot', `<${node.tag}> declares no default slot, so its child elements have nowhere to go`, { ...sat, severity: 'warn' }));
        if (name === '' && entry.void && kids.length) problems.push(problem('void-content', `<${node.tag}> cannot have content`, sat));
        kids.forEach((k, i) => {
            const kpath = `${sat.path}[${i}]`;
            if (isText(k)) {
                if (name !== '') problems.push(problem('text-slot', 'text can only be in the default slot', { path: kpath, id: at.id }));
                if (k.length > LIMITS.text) problems.push(problem('text-long', `text is longer than ${LIMITS.text} characters`, { path: kpath, id: at.id }));
                if (CONTROL.test(k)) problems.push(problem('text-control', 'text contains a control character', { path: kpath, id: at.id }));
            } else {
                checkNode(k, node, kpath, depth + 1, ctx, keep, [...trail, node.tag]);
            }
        });
        if (name === '' && JSON.stringify(tidy(kids, keep)) !== JSON.stringify(kids)) problems.push(problem('text-form', 'text is not in canonical form (single spaces, trimmed, merged)', { ...sat, severity: 'warn' }));
    }
}

// ---------------------------------------------------------------- HTML out

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

// Optional end tags. tags is the open elements from the root (index 0 is a placeholder); the result is how many of them stay open when a start tag for `tag` arrives.
// The parser uses it to close implicitly, and the validator uses it to refuse a nesting that HTML could not spell (<li> directly in <li>), so toHtml output always reads back.
function impliedCut(tags, tag) {
    let len = tags.length;
    if (tags[len - 1] === 'p' && BLOCKS.has(tag)) len--;
    const popTo = (names, stop) => {
        let target = -1;
        for (let i = len - 1; i >= 1; i--) { const t = tags[i]; if (stop.has(t)) break; if (names.has(t)) target = i; }
        if (target >= 0) len = target;
    };
    if (tag === 'li') popTo(new Set(['li']), new Set(['ul', 'ol']));
    else if (tag === 'option') popTo(new Set(['option']), new Set());
    else if (tag === 'dt' || tag === 'dd') popTo(new Set(['dt', 'dd']), new Set(['dl']));
    else if (tag === 'tr') popTo(new Set(['tr', 'td', 'th']), new Set(['table', 'thead', 'tbody', 'tfoot']));
    else if (tag === 'td' || tag === 'th') popTo(new Set(['td', 'th']), new Set(['tr', 'table']));
    else if (tag === 'tbody' || tag === 'thead' || tag === 'tfoot') popTo(new Set(['tr', 'td', 'th', 'thead', 'tbody', 'tfoot']), new Set(['table']));
    return len;
}

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

// ---------------------------------------------------------------- JSON

export const toJson = (doc, space) => JSON.stringify(doc, null, space);

/** A document from JSON text or an object: { doc, problems }; doc is null when the document has errors (a saved page is machine-made: it is not repaired). */
export function fromJson(input, { registry } = {}) {
    if (!registry) throw new TypeError('fromJson: a registry is required');
    let value = input;
    if (typeof input === 'string') {
        if (input.length > LIMITS.input * 2) return { doc: null, problems: [problem('too-large', 'the document is too large')] };
        try { value = JSON.parse(input); } catch (error) { return { doc: null, problems: [problem('json', `not valid JSON: ${error.message}`)] }; }
    }
    const problems = validateDoc(value, registry);
    return { doc: errorsOf(problems).length ? null : value, problems };
}

// ---------------------------------------------------------------- operations (pure: each returns a new document and leaves the old one untouched)

function rewrite(list, id, fn) {
    let changed = false;
    const out = [];
    for (const child of list) {
        if (isText(child)) { out.push(child); continue; }
        if (child.id === id) { changed = true; const r = fn(child); if (Array.isArray(r)) out.push(...r); else if (r !== null) out.push(r); continue; }
        let slotChanged = false;
        const slots = {};
        for (const [k, v] of Object.entries(child.slots)) { const nv = rewrite(v, id, fn); if (nv !== v) slotChanged = true; slots[k] = nv; }
        if (slotChanged) { changed = true; out.push({ ...child, slots: orderSlots(slots) }); } else out.push(child);
    }
    return changed ? out : list;
}
const update = (doc, id, fn) => {
    const nodes = rewrite(doc.nodes, id, fn);
    if (nodes === doc.nodes) throw new ModelError('not-found', `no node has the id ${id}`, []);
    return { ...doc, nodes };
};
const withSlot = (slots, name, list) => orderSlots({ ...slots, [name]: list });
const contains = (node, id) => { let found = false; const go = n => { if (n.id === id) found = true; for (const kids of Object.values(n.slots)) for (const k of kids) if (!isText(k) && !found) go(k); }; go(node); return found; };

const ancestorTags = (doc, id) => {
    const path = [];
    const go = (list, trail) => { for (const c of list) { if (isText(c)) continue; if (c.id === id) { path.push(...trail); return true; } if (Object.values(c.slots).some(k => go(k, [...trail, c.tag]))) return true; } return false; };
    go(doc.nodes, []);
    return path;
};

// Checks a subtree that is about to be placed under `parentNode` in `slot`; throws with the problems when it is not valid there.
function checkPlacement(doc, parentNode, slot, nodes, registry) {
    if (!registry) return;
    const problems = [];
    const ctx = { registry, problems, ids: new Set(), count: 0, seq: Number.MAX_SAFE_INTEGER };
    const parentEntry = parentNode ? registry.entry(parentNode.tag) : null;
    if (parentNode && !parentEntry) throw new ModelError('unknown-tag', `unknown element <${parentNode.tag}>`, []);
    if (parentEntry) {
        if (parentEntry.void) problems.push(problem('void-content', `<${parentNode.tag}> cannot have content`, { id: parentNode.id }));
        if (slot !== '' && (parentEntry.native || !slotExists(parentEntry, slot))) problems.push(problem('unknown-slot', `<${parentNode.tag}> has no slot "${slot}"`, { id: parentNode.id }));
    } else if (slot !== '') problems.push(problem('slot-parent', 'a top-level node has no slot'));
    const trail = parentNode ? [...ancestorTags(doc, parentNode.id), parentNode.tag] : [];
    for (const n of nodes) { if (isText(n)) { if (slot !== '') problems.push(problem('text-slot', 'text can only be in the default slot')); } else checkNode(n, parentNode, n.id ?? 'node', 1, ctx, false, trail); }
    const errors = errorsOf(problems);
    if (errors.length) throw new ModelError('invalid', errors[0].message, errors);
}

function resolveParent(doc, parent) {
    if (parent === null || parent === undefined) return null;
    const at = locate(doc, parent);
    if (!at) throw new ModelError('not-found', `no node has the id ${parent}`, []);
    return at.node;
}
const clampIndex = (index, length) => {
    if (index === undefined || index === null) return length;
    if (!Number.isInteger(index) || index < 0 || index > length) throw new ModelError('bad-index', `index ${index} is outside 0..${length}`, []);
    return index;
};
const listAt = (doc, parentNode, slot) => (parentNode ? parentNode.slots[slot] ?? [] : doc.nodes);

function place(doc, parentNode, slot, index, nodes) {
    const list = listAt(doc, parentNode, slot);
    const at = clampIndex(index, list.length);
    const next = [...list.slice(0, at), ...nodes, ...list.slice(at)];
    if (!parentNode) return { ...doc, nodes: next };
    return update(doc, parentNode.id, p => ({ ...p, slots: withSlot(p.slots, slot, next) }));
}

/** Insert a new node (a spec: { tag, props?, text?, children?, slots? }) under `parent` (an id; null for the top level) in `slot` at `index` (default: the end). Returns { doc, id }. */
export function insertNode(doc, { parent = null, slot = '', index, node }, registry) {
    const parentNode = resolveParent(doc, parent);
    const { doc: seqDoc, nodes } = assignIds(doc, [node]);
    checkPlacement(doc, parentNode, slot, nodes, registry);
    return { doc: place(seqDoc, parentNode, slot, index, nodes), id: nodes[0].id };
}

/** Move a node under `parent` in `slot`; `index` counts among the target's children once the node has been taken out. */
export function moveNode(doc, { id, parent = null, slot = '', index }, registry) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    if (parent !== null && parent !== undefined && contains(at.node, parent)) throw new ModelError('cycle', 'a node cannot move into itself', []);
    const removed = update(doc, id, () => null);
    const parentNode = resolveParent(removed, parent);
    checkPlacement(removed, parentNode, slot, [at.node], registry);
    return { doc: place(removed, parentNode, slot, index, [at.node]), id };
}

/** Remove a node and everything in it. */
export function removeNode(doc, { id }) {
    if (!locate(doc, id)) throw new ModelError('not-found', `no node has the id ${id}`, []);
    return { doc: update(doc, id, () => null), id };
}

const cloneWithIds = (node, seq) => (isText(node) ? node : { id: `n${seq.n++}`, tag: node.tag, props: { ...node.props }, slots: Object.fromEntries(Object.entries(node.slots).map(([k, v]) => [k, v.map(c => cloneWithIds(c, seq))])) });

/** Copy a node (with fresh ids) right after the original. Returns { doc, id } with the copy's id. */
export function duplicateNode(doc, { id }) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    const seq = { n: doc.seq };
    const copy = cloneWithIds(at.node, seq);
    return { doc: place({ ...doc, seq: seq.n }, at.parent, at.slot ?? '', at.index + 1, [copy]), id: copy.id };
}

/** Put a new element around a node: the wrapper takes the node's place (and slot) and holds it in its default slot. Returns { doc, id } with the wrapper's id. */
export function wrapNode(doc, { id, wrapper }, registry) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    const spec = typeof wrapper === 'string' ? { tag: wrapper } : wrapper;
    const { doc: seqDoc, nodes: [box] } = assignIds(doc, [spec]);
    const wrapped = { ...box, slots: orderSlots({ ...box.slots, '': [at.node, ...(box.slots[''] ?? [])] }) };
    checkPlacement(doc, at.parent, at.slot ?? '', [wrapped], registry);
    return { doc: update(seqDoc, id, () => wrapped), id: box.id };
}

/** Set (or, with false, null or undefined, remove) one attribute of a node. A number becomes its text. */
export function setProp(doc, { id, name, value }, registry) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    const next = { ...at.node.props };
    if (value === false || value === undefined || value === null) delete next[name];
    else next[name] = value === true ? true : String(value);
    if (registry) {
        const entry = registry.entry(at.node.tag);
        const errors = [];
        if (has(next, name)) {
            if (name === 'style' || (/^on/.test(name) && !entry?.props.has(name)) || name === 'slot' || !ATTR_NAME.test(name)) errors.push(problem('unknown-prop', `"${name}" cannot be set`, { id }));
            else {
                const info = entry && attrInfo(entry, name);
                if (!info) errors.push(problem('unknown-prop', `<${at.node.tag}> has no prop "${name}"`, { id }));
                else { const why = valueProblem(name, info, next[name]); if (why) errors.push(problem('bad-value', `<${at.node.tag}> ${name} ${why}`, { id })); }
            }
        }
        if (errors.length) throw new ModelError('invalid', errors[0].message, errors);
    }
    return { doc: update(doc, id, n => ({ ...n, props: next })), id };
}

/** Replace the text of a node: its text children become one canonical string (or none when empty); element children stay. */
export function setText(doc, { id, text }) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    if (VOID.has(at.node.tag)) throw new ModelError('void-content', `<${at.node.tag}> cannot have content`, []);
    const keep = PRESERVE.has(at.node.tag);
    const value = keep ? String(text ?? '') : normalizeText(text);
    if (value.length > LIMITS.text) throw new ModelError('text-long', `text is longer than ${LIMITS.text} characters`, []);
    if (CONTROL.test(value)) throw new ModelError('text-control', 'text contains a control character', []);
    const elements = (at.node.slots[''] ?? []).filter(c => !isText(c));
    const list = tidy([...(value ? [value] : []), ...elements], keep);
    return { doc: update(doc, id, n => ({ ...n, slots: withSlot(n.slots, '', list) })), id };
}

/** Move a node into another named slot of its parent (at the end). */
export function setSlot(doc, { id, slot }, registry) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    if (!at.parent) throw new ModelError('slot-parent', 'a top-level node has no slot', []);
    return moveNode(doc, { id, parent: at.parent.id, slot, index: undefined }, registry);
}

// ---------------------------------------------------------------- history

/** A small command stack of document snapshots (documents are immutable, so a snapshot is a reference). push(next, key): pushes with the same key in a row
 *  replace each other's step (typing in one field is one undo). */
export function createHistory(initial, { limit = 200 } = {}) {
    let present = initial;
    let past = [];
    let future = [];
    let lastKey = null;
    return {
        get doc() { return present; },
        get canUndo() { return past.length > 0; },
        get canRedo() { return future.length > 0; },
        push(next, key = null) {
            if (next === present) return present;
            if (!(key !== null && key === lastKey)) { past.push(present); if (past.length > limit) past.shift(); }
            present = next; future = []; lastKey = key;
            return present;
        },
        undo() { if (!past.length) return present; future.push(present); present = past.pop(); lastKey = null; return present; },
        redo() { if (!future.length) return present; past.push(present); present = future.pop(); lastKey = null; return present; },
        reset(doc) { present = doc; past = []; future = []; lastKey = null; return present; },
        get size() { return past.length; },
    };
}
