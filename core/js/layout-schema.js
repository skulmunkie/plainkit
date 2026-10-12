// Layout model, part 1 of 5: what may exist (the element registry and native tags), attribute value checks, the canonical text form, and the shared
// vocabulary (limits, problems, ModelError, empty documents). Pure data and checks; js/layout-model.js re-exports every part and has the overview.

export const MODEL_VERSION = 1;
export const LIMITS = { depth: 32, nodes: 5000, value: 10000, text: 100000, input: 2000000 };


export const kebab = s => String(s).replace(/[A-Z]/g, c => '-' + c.toLowerCase());
export const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ---------------------------------------------------------------- what may exist: pk-* elements from the API, and native content tags

export const S = 'string', B = 'boolean', N = 'number';
export const NATIVE = {
    h1: {}, h2: {}, h3: {}, h4: {}, h5: {}, h6: {}, p: {}, div: {}, span: {}, section: {}, article: {}, aside: {}, header: {}, footer: {}, main: {}, nav: {},
    ul: {}, ol: { start: N, reversed: B }, li: { value: N }, dl: {}, dt: {}, dd: {}, blockquote: { cite: S }, pre: {}, figure: {}, figcaption: {},
    a: { href: S, target: S, rel: S, download: S }, strong: {}, em: {}, b: {}, i: {}, u: {}, small: {}, code: {}, kbd: {}, mark: {}, sub: {}, sup: {},
    abbr: {}, cite: {}, q: { cite: S }, time: { datetime: S }, label: { for: S }, br: {}, hr: {},
    img: { src: S, alt: S, width: N, height: N, loading: ['lazy', 'eager'] },
    table: {}, caption: {}, thead: {}, tbody: {}, tfoot: {}, tr: {}, th: { colspan: N, rowspan: N, scope: ['row', 'col', 'rowgroup', 'colgroup'] }, td: { colspan: N, rowspan: N },
    input: { type: ['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'checkbox', 'radio', 'date', 'time', 'range', 'color'], name: S, value: S, placeholder: S, checked: B, disabled: B, readonly: B, required: B, min: S, max: S, step: S, minlength: N, maxlength: N, pattern: S, autocomplete: S },
    option: { value: S, selected: B, disabled: B, label: S }, button: { type: ['button', 'submit', 'reset'], disabled: B, name: S, value: S },
};
export const VOID = new Set(['br', 'hr', 'img', 'input']);
export const PHRASING = new Set(['a', 'span', 'strong', 'em', 'b', 'i', 'u', 'small', 'code', 'kbd', 'mark', 'sub', 'sup', 'abbr', 'cite', 'q', 'time', 'label', 'br', 'img', 'button', 'input']);
export const BLOCKS = new Set(['div', 'p', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'pre', 'hr', 'section', 'article', 'blockquote', 'dl', 'figure', 'header', 'footer', 'main', 'nav', 'aside']);
export const PRESERVE = new Set(['pre', 'pk-code-block', 'pk-textarea']);
// Named so the message for a hostile tag says what it is; anything else that is not in the registry is just unknown.
export const FORBIDDEN = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'template', 'noscript', 'svg', 'math', 'frame', 'frameset', 'applet', 'textarea', 'title']);
export const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript', 'iframe']);
export const URL_ATTRS = new Set(['href', 'src', 'cite', 'action', 'formaction', 'poster', 'srcset', 'data', 'manifest', 'ping']);
const URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
export const RESERVED_ID_ATTR = 'data-lb-id';

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
export function attrInfo(entry, name) {
    const own = entry.props.get(name);
    if (own) return own;
    if (name === 'id' || name === 'class' || name === 'title' || name === 'lang' || name === 'role' || name === 'tab') return { name, type: S, values: null };
    if (name === 'dir') return { name, type: 'enum', values: ['ltr', 'rtl', 'auto'] };
    if (name === 'hidden') return { name, type: B, values: null };
    if (name === 'tabindex') return { name, type: N, values: null };
    if (/^(aria|data)-[a-z][a-z0-9-]*$/.test(name) && name !== RESERVED_ID_ATTR) return { name, type: S, values: null };
    return null;
}

export const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
export const CONTROL_G = new RegExp(CONTROL.source, 'g');
const ID_VALUE = /^[A-Za-z][\w:.-]*$/;
const CLASS_VALUE = /^[\w:./%@-]+(?: [\w:./%@-]+)*$/;
export const SLOT_NAME = /^(?:[A-Za-z][\w.-]*)?$/;
export const NODE_ID = /^n[1-9]\d*$/;
export const ATTR_NAME = /^[a-z][a-z0-9:._-]*$/;

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

export function slotExists(entry, name) {
    if (entry.slots.some(s => s.name === name)) return true;
    return entry.slots.some(s => s.dynamic && new RegExp('^' + s.name.replace(/<[^>]+>/g, '[\\w.-]+') + '$').test(name));
}

// ---------------------------------------------------------------- text form

export const isText = c => typeof c === 'string';
export const collapse = s => s.replace(/\r\n?/g, '\n').replace(/[ \t\n\f]+/g, ' ');

// The canonical form of a child list: adjacent text merged, whitespace collapsed to one space, formatting whitespace (a run with a line break, on its own) dropped,
// the edges trimmed. In preserved content (pre, code blocks) text is only merged. What toHtml writes and fromHtml reads are the same canonical form.
export function tidy(list, preserve) {
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

export const emptyDoc = () => ({ version: MODEL_VERSION, seq: 1, nodes: [] });

export const orderSlots = slots => {
    const out = {};
    if (slots['']?.length) out[''] = slots[''];
    for (const [k, v] of Object.entries(slots)) if (k !== '' && v.length) out[k] = v;
    return out;
};

export class ModelError extends Error {
    constructor(code, message, problems) { super(message); this.name = 'ModelError'; this.code = code; this.problems = problems ?? []; }
}

export const problem = (code, message, extra = {}) => ({ code, severity: extra.severity ?? 'error', message, ...(extra.id ? { id: extra.id } : {}), path: extra.path ?? '' });
export const errorsOf = problems => problems.filter(p => p.severity === 'error');
