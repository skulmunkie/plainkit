// The API a custom element declares in its meta file, and the checks that keep it true. Pure (no file access): the build and the guard
// tests pass in the parsed meta, the template and the css.
//
// elements/<name>/<name>.meta.json:
//   tag, title, summary, group          identity (tag is pk-<name>)
//   delegatesFocus, formAssociated      optional booleans
//   props[]         { name, type: string|boolean|number|enum|json (object or array: a JSON attribute or a property), default, values?, reflect, description }
//   slots[]         { name ('' = default), description }
//   events[]        { name, detail, description }
//   parts[]         { name, description }      ::part(name) is the styling hook
//   cssProperties[] { name (--pk-...), description, default? }
//   methods[]       { name, description }
//   a11y            keyboard and ARIA notes
//   blazor          { component, params: [{ name, prop | slot | event }] }
//   examples[]      { title, html }   usage snippets shown in the gallery: <pk-*> markup, never a style attribute

export const PROP_TYPES = ['string', 'boolean', 'number', 'enum', 'json'];
const NAME = /^[a-z][a-zA-Z0-9]*$/;
const CSS_PROP = /^--pk-[a-z0-9-]+$/;

const isText = v => typeof v === 'string' && v.trim().length > 0;

export function validateApi(meta, { template = '', css = '', name = meta?.tag ?? '?' } = {}) {
    const p = [];
    const need = (ok, msg) => { if (!ok) p.push(`${name}: ${msg}`); };
    need(meta && typeof meta === 'object', 'meta is not an object');
    if (!meta || typeof meta !== 'object') return p;
    need(/^pk-[a-z][a-z0-9-]*$/.test(meta.tag ?? ''), 'tag must look like pk-name');
    for (const k of ['title', 'summary', 'group', 'a11y']) need(isText(meta[k]), `${k} is required`);
    for (const k of ['props', 'slots', 'events', 'parts', 'cssProperties', 'methods', 'examples']) need(Array.isArray(meta[k]), `${k} must be an array (empty when there is none)`);
    need(meta.blazor && isText(meta.blazor.component) && Array.isArray(meta.blazor.params), 'blazor { component, params } is required');
    if (p.length) return p;

    const names = new Set();
    for (const d of meta.props) {
        need(NAME.test(d.name ?? ''), `prop "${d.name}" needs a camelCase name`);
        need(!names.has(d.name), `prop "${d.name}" is declared twice`); names.add(d.name);
        need(PROP_TYPES.includes(d.type), `prop "${d.name}" has type ${d.type}`);
        need('default' in d, `prop "${d.name}" needs a default`);
        need(typeof d.reflect === 'boolean', `prop "${d.name}" needs reflect true or false`);
        need(isText(d.description), `prop "${d.name}" needs a description`);
        if (d.type === 'enum') { need(Array.isArray(d.values) && d.values.length > 1, `enum prop "${d.name}" needs values`); need(d.values?.includes(d.default), `enum prop "${d.name}" default is not one of its values`); }
        if (d.type === 'boolean') need(d.default === false, `boolean prop "${d.name}" must default to false (an attribute is presence)`);
        if (d.type === 'number') need(typeof d.default === 'number', `number prop "${d.name}" needs a numeric default`);
        if (d.type === 'json') need(typeof d.default === 'object', `json prop "${d.name}" needs an object, array or null default`);
        if (d.type === 'string') need(typeof d.default === 'string', `string prop "${d.name}" needs a string default`);
    }
    for (const [k, list, key] of [['slot', meta.slots, 'name'], ['event', meta.events, 'name'], ['part', meta.parts, 'name'], ['cssProperty', meta.cssProperties, 'name'], ['method', meta.methods, 'name']]) {
        const seen = new Set();
        for (const x of list) {
            need(typeof x[key] === 'string' && (k === 'slot' || x[key] !== ''), `${k} needs a ${key}`);
            need(isText(x.description), `${k} "${x[key]}" needs a description`);
            need(!seen.has(x[key]), `${k} "${x[key]}" is declared twice`); seen.add(x[key]);
        }
    }
    for (const e of meta.events) need('detail' in e, `event "${e.name}" needs a detail (null when there is none)`);
    for (const c of meta.cssProperties) need(CSS_PROP.test(c.name), `css property "${c.name}" must start with --pk-`);

    // The template and the css are held to the API.
    const bound = new Set([...template.matchAll(/\{\{\s*([\w.]+)/g)].map(m => m[1]).concat([...template.matchAll(/data-if(?:-not)?="([\w.]+)"/g)].map(m => m[1])));
    for (const b of bound) need(names.has(b), `template binds {{${b}}} but no prop has that name`);
    const tplSlots = new Set([...template.matchAll(/<slot(?:\s+name="([^"]*)")?/g)].map(m => m[1] ?? ''));
    for (const s of tplSlots) need(meta.slots.some(x => x.name === s), `template has a slot "${s}" that meta.slots does not describe`);
    for (const s of meta.slots) need(tplSlots.has(s.name), `meta.slots describes "${s.name}" but the template has no such slot`);
    const tplParts = new Set([...template.matchAll(/\spart="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
    for (const s of tplParts) need(meta.parts.some(x => x.name === s), `template part "${s}" is not in meta.parts`);
    for (const s of meta.parts) need(tplParts.has(s.name), `meta.parts describes "${s.name}" but the template has no such part`);
    const cssUsed = new Set([...css.matchAll(/var\(\s*(--pk-[a-z0-9-]+)/g)].map(m => m[1]));
    for (const c of meta.cssProperties) need(cssUsed.has(c.name), `css property ${c.name} is declared but the css never reads it`);
    for (const u of cssUsed) need(meta.cssProperties.some(c => c.name === u), `css reads ${u} but meta.cssProperties does not declare it`);
    need(!/<style[\s>]|\sstyle\s*=/.test(template), 'the template must not carry a style element or attribute');
    need(!/\sstyle\s*=|<style[\s>]/.test(meta.examples.map(e => e.html).join('\n')), 'examples must not carry a style attribute');
    for (const e of meta.examples) need(isText(e.title) && isText(e.html), 'each example needs a title and html');
    need(meta.examples.length > 0, 'at least one example is required');
    return p;
}

// The same props as the runtime wants them: { name: { type, default, values, reflect } }.
export const propsObject = meta => Object.fromEntries(meta.props.map(({ name, type, default: d, values, reflect }) => [name, { type, default: d, ...(values ? { values } : {}), reflect }]));
