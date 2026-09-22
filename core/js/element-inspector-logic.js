// Pure logic behind the element inspector (js/element-inspector.js): turning an element's API metadata into display rows. No DOM, so node
// tests cover it.

export const kebab = s => String(s).replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const show = v => (v === '' ? '""' : v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const list = a => (Array.isArray(a) ? a : []);

// The markup of a live element as an author would write it: the data-* attributes the SDK adds and an empty hidden are left out.
export const cleanMarkup = html => String(html ?? '').replace(/\s(data-[\w-]+="[^"]*")/g, '').replace(/\shidden(="")?(?=[\s>])/g, '');

// True when the metadata can be inspected: an object with a tag.
export const isElementMeta = meta => Boolean(meta && typeof meta === 'object' && typeof meta.tag === 'string' && meta.tag);

// The reference tables of an element: everything the meta declares, as rows of display strings.
export function describeElement(meta) {
    if (!isElementMeta(meta)) return null;
    return {
        tag: meta.tag,
        title: meta.title ?? meta.tag,
        group: meta.group ?? '',
        summary: meta.summary ?? '',
        props: list(meta.props).map(p => ({ name: p.name, attribute: kebab(p.name), type: p.type === 'enum' ? list(p.values).join(' | ') : String(p.type ?? ''), default: show(p.default), description: p.description ?? '' })),
        slots: list(meta.slots).map(s => ({ name: s.name || '(default)', description: s.description ?? '' })),
        events: list(meta.events).map(e => ({ name: e.name, detail: show(e.detail), description: e.description ?? '' })),
        parts: list(meta.parts).map(p => ({ selector: `${meta.tag}::part(${p.name})`, description: p.description ?? '' })),
        cssProperties: list(meta.cssProperties).map(c => ({ name: c.name, default: show(c.default), description: c.description ?? '' })),
        methods: list(meta.methods).map(m => ({ name: m.name, description: m.description ?? '' })),
        writes: list(meta.writes).map(w => ({ target: w.target ?? '', attributes: list(w.attributes).join(', '), why: w.why ?? '' })),
        a11y: meta.a11y ?? '',
    };
}
