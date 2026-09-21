// Generates the Pk* Blazor wrappers: one Razor component per SDK element, from core/dist/elements/api.json (props, slots, events and their typed
// details) plus the hand-kept mapping in blazor/mappings/<name>.json (the C# names, types, enums and two-way bindings). Node only, no dependencies.
//
//   node scripts/generate-blazor.mjs           write blazor/src/PlainKit.Blazor/Generated/ (and wwwroot/PlainKit.Blazor.lib.module.js)
//   node scripts/generate-blazor.mjs --check   change nothing; exit 1 when the generated files are out of date (CI)
//   node scripts/generate-blazor.mjs --list    print what is generated, skipped and still to do
//
// Run `node core/tools/build.mjs` first: this reads core/dist. Every generated file is CRLF (.gitattributes). Never edit them by hand: change the
// mapping (or the SDK) and run this again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const paths = {
    api: path.join(root, 'core', 'dist', 'elements', 'api.json'),
    mappings: path.join(root, 'blazor', 'mappings'),
    package: path.join(root, 'blazor', 'src', 'PlainKit.Blazor'),
    generated: path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'Generated'),
    components: path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'Components'),
    module: path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot', 'PlainKit.Blazor.lib.module.js'),
};
const GENERATOR = 'scripts/generate-blazor.mjs';

// ---------------------------------------------------------------- names

const upper = s => s[0].toUpperCase() + s.slice(1);
/** "datetime-local" -> "DatetimeLocal", "top-end" -> "TopEnd". */
export const pascal = s => String(s).split(/[^A-Za-z0-9]+/).filter(Boolean).map(upper).join('');
/** pk-toast-stack -> PkToastStack (the rule blazor-mappings.test.mjs enforces). */
export const pkName = tag => 'Pk' + pascal(tag.replace(/^pk-/, ''));
export const kebab = n => n.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const memberName = v => { const p = pascal(v) || 'None'; return /^[0-9]/.test(p) ? 'V' + p : p; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\s+/g, ' ').trim();
const lit = s => JSON.stringify(String(s));
/** pk-value-change -> PkValueChangeEventArgs */
export const argsName = eventName => 'Pk' + pascal(eventName.replace(/^pk-/, '')) + 'EventArgs';

// ---------------------------------------------------------------- types

const NUMERIC = new Set(['int', 'long', 'double', 'float', 'decimal']);
const SIMPLE = new Set(['string', 'bool', 'DateOnly', 'object', ...NUMERIC]);
const COLLECTION = /^(IReadOnlyList|IReadOnlyCollection|IEnumerable|List|IDictionary|Dictionary|HashSet)</;
const stripNull = t => t.replace(/\?$/, '');

/**
 * True for a collection or array whose element types are all simple, so it can be sent to the element as a JSON attribute. `known` are the public
 * types PlainKit.Blazor declares (records such as PkChartData): with them a collection of them, or one of them on its own, is a JSON value too.
 */
export function isJsonType(t, known = new Set()) {
    const base = stripNull(t);
    if (!(COLLECTION.test(base) || /\[\]$/.test(base) || known.has(base))) return false;
    const ids = base.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    return ids.every(i => SIMPLE.has(i) || known.has(i) || COLLECTION.test(i + '<') || i === 'IDictionary');
}

/** The public types (record, class, struct, enum) declared in the .cs files directly in `dir`: what a mapping type may name for a JSON parameter. */
export function knownTypes(dir) {
    const found = new Set();
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.cs')))
        for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/^public\s+(?:(?:sealed|static|abstract|readonly|partial)\s+)*(?:record\s+struct|record|class|struct|enum)\s+(\w+)/gm)) found.add(m[1]);
    return found;
}

/** The C# type of one detail field, from the API's description of it ("string", "bool" or "boolean", "number", "string[]", ...). */
export function fieldType(t) {
    const s = String(t).trim();
    if (s === 'string') return 'string?';
    if (s === 'bool' || s === 'boolean') return 'bool?';
    if (s === 'number') return 'double?';
    if (s === 'string[]' || s === 'IReadOnlyList<string>') return 'string[]?';
    if (s === 'IDictionary<string, string>') return 'Dictionary<string, string>?';
    if (s === 'File[]') return 'PkFileInfo[]?';
    return 'JsonElement?';
}

/** The fields of an event's detail: detailProps, else an object detail, else a string like "{ a: string, b }". Null detail and native events have none. */
export function detailFields(ev) {
    if (ev.detailProps && typeof ev.detailProps === 'object') return Object.entries(ev.detailProps);
    if (ev.detail && typeof ev.detail === 'object') return Object.entries(ev.detail);
    if (typeof ev.detail === 'string' && /^\{.*\}$/.test(ev.detail.trim())) {
        // Split on top-level commas only (a type can hold one: "{ file: File, reason: string }[]").
        const inner = ev.detail.trim().slice(1, -1); const parts = []; let depth = 0, cur = '';
        for (const c of inner) { if ('{[<('.includes(c)) depth++; if ('}]>)'.includes(c)) depth--; if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c; }
        if (cur.trim()) parts.push(cur);
        return parts.map(p => { const i = p.indexOf(':'); return i < 0 ? [p.trim(), 'object'] : [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }).filter(([n]) => n);
    }
    return [];
}
const isNative = ev => typeof ev.detail === 'string' && ev.detail.startsWith('native ');

/** A converter from an event-args field (its C# type) to the type of the parameter it drives, or null when there is none. */
export function convert(expr, from, to) {
    const t = to.trim();
    if (t === 'string' || t === 'string?') return from === 'string?' ? expr : `${expr}?.ToString()`;
    if (t === 'bool') return from === 'bool?' ? `${expr} == true` : null;
    if (from === 'double?') {
        if (t === 'double') return `${expr} ?? 0`;
        if (t === 'double?') return expr;
        if (t === 'int' || t === 'long') return `(${t})(${expr} ?? 0)`;
        if (t === 'int?' || t === 'long?') return `(${t})${expr}`;
        if (t === 'decimal') return `(decimal)(${expr} ?? 0)`;
        if (t === 'decimal?') return `(decimal?)${expr}`;
        if (t === 'float') return `(float)(${expr} ?? 0)`;
        if (t === 'float?') return `(float?)${expr}`;
    }
    if (from === 'string?' && (t === 'DateOnly?')) return `PkAttr.ParseDate(${expr})`;
    return null;
}

// ---------------------------------------------------------------- modelling one element

const inferMap = p => p.map ?? (p.prop !== undefined ? 'prop' : p.slot !== undefined ? 'slot' : p.event !== undefined ? 'event' : p.cssProperty !== undefined ? 'cssProperty' : p.text !== undefined ? 'text' : 'wrapper');

function enumFrom(name, pairs, owner) { return { name, members: pairs.map(([n, v]) => ({ name: n, value: v })), owners: [owner] }; }

/** The model of one element event (a name, the Blazor attribute, the args type and its fields); native events (click) are marked. */
export function eventModel(api) {
    const name = api.name;
    if (isNative(api)) {
        const args = api.detail === 'native MouseEvent' ? 'MouseEventArgs' : 'EventArgs';
        return { name, attr: 'on' + name.replace(/-/g, ''), native: true, args, fields: [], cancelable: api.cancelable === true, description: api.description };
    }
    const fields = detailFields(api).map(([n, t]) => ({ key: n, cs: fieldType(t), prop: memberName(n), type: t }));
    return { name, attr: 'on' + name, native: false, args: fields.length ? argsName(name) : 'EventArgs', fields, cancelable: api.cancelable === true, description: api.description };
}

/** Record an event's name and args type in the shared registry (the [EventHandler] classes and the browser-side registration come from it). */
export function noteEventInto(reg, ev, owner) {
    if (ev.native) return;
    reg.eventNames.add(ev.name);
    if (!ev.fields.length) return;
    const cur = reg.events.get(ev.args) ?? { name: ev.name, args: ev.args, fields: new Map(), owners: [] };
    for (const f of ev.fields) {
        const have = cur.fields.get(f.prop);
        if (have && have.cs !== f.cs) throw new Error(`${ev.name}: field "${f.key}" is ${have.cs} on one element and ${f.cs} on ${owner}; the shared ${ev.args} cannot hold both`);
        if (!have) cur.fields.set(f.prop, { ...f, description: null });
    }
    if (!cur.owners.includes(owner)) cur.owners.push(owner);
    reg.events.set(ev.args, cur);
}

/**
 * Model one element: the parameters, the attributes, the slots, the event handlers. Pure: the shared enum and event-args registries are
 * passed in and filled. Returns { component, tag, params[], attrs[], slots[], handlers[], todo[], notGenerated[] }.
 */
export function modelElement(el, mapping, reg) {
    const comp = mapping.component;
    const out = { component: comp, tag: el.tag, summary: el.summary, params: [], attrs: [], children: [], handlers: new Map(), todo: [], notGenerated: [], usesClass: false, usesAttributes: false };
    const names = new Set(mapping.params.map(p => p.name));
    const declared = new Set();
    const propParam = {}; // C# name -> resolved prop param (for Changed pairing)
    const todo = (param, reason) => out.todo.push({ component: comp, param, reason });
    const skip = (param, reason) => out.notGenerated.push({ component: comp, param, reason });
    const handler = ev => { if (!out.handlers.has(ev.attr)) out.handlers.set(ev.attr, { ...ev, updates: [], callbacks: [] }); return out.handlers.get(ev.attr); };
    const declare = d => { if (declared.has(d.name)) return false; declared.add(d.name); out.params.push(d); return true; };

    const eventInfo = name => {
        const api = el.events.find(e => e.name === name);
        return api ? eventModel(api) : null;
    };
    const noteEvent = (ev, owner) => noteEventInto(reg, ev, owner);

    // The enum a parameter uses: the mapping's named enum (values from `enum`), or the API prop's values under the mapping's type name.
    const enumType = (typeName, pairs, owner) => {
        const have = reg.enums.get(typeName);
        const next = enumFrom(typeName, pairs, owner);
        if (have) {
            const same = JSON.stringify(have.members) === JSON.stringify(next.members);
            if (!same) throw new Error(`enum ${typeName} is declared with different values by ${have.owners.join(', ')} and ${owner}`);
            if (!have.owners.includes(owner)) have.owners.push(owner);
        } else reg.enums.set(typeName, next);
        return typeName;
    };

    // ---- 1. resolve every parameter's kind and type
    const resolved = [];
    for (const p of mapping.params) {
        const map = inferMap(p);
        const r = { p, map, name: p.name };
        if (map === 'prop') resolved.push(resolveProp(el, p, r, comp, enumType, todo, reg.types)); else resolved.push(r);
    }
    for (const r of resolved) if (r.map === 'prop' && r.cs) propParam[r.name] = r;

    // ---- 2. emit
    for (const r of resolved) {
        const { p, map } = r;
        if (map === 'prop') {
            if (!r.cs) { skip(p.name, r.reason); continue; }
            const api = r.api;
            declare({ name: p.name, kind: 'param', cs: r.cs, init: r.init, doc: api.description, note: p.note });
            out.attrs.push({ attr: kebab(p.prop), expr: r.expr, boolean: r.attr === 'bool' });
            if (r.todo) todo(p.name, r.todo);
            // `bind` is one event or a list of them (PkCommandPalette.Open follows pk-open and pk-close).
            for (const b of [p.bind].flat().filter(Boolean)) addBind(r, { event: b.event, literal: typeof b.value !== 'string' ? b.value : undefined, path: typeof b.value === 'string' ? b.value.replace(/^detail\./, '') : undefined });
        } else if (map === 'slot' || map === 'text') {
            const slot = map === 'text' ? '' : p.slot;
            if (/[<>]/.test(slot)) { skip(p.name, `dynamic slot name "${slot}": the wrapper has to render one slot per item, which needs a hand-written component`); continue; }
            const t = (p.type ?? 'RenderFragment?').trim();
            if (/^RenderFragment<.*>\??$/.test(t)) { skip(p.name, `${t} is a templated fragment; needs a hand-written component`); continue; }
            const text = t === 'string' || t === 'string?';
            const api = el.slots.find(s => s.name === slot);
            declare({ name: p.name, kind: 'param', cs: text ? 'string?' : 'RenderFragment?', doc: api?.description ?? (slot === '' ? 'The content.' : `The ${slot} slot.`), note: p.note });
            out.children.push({ slot, name: p.name, text });
        } else if (map === 'event') {
            const ev = eventInfo(p.event);
            if (!ev) { skip(p.name, `the element has no event ${p.event}`); continue; }
            noteEvent(ev, comp);
            const m = /^EventCallback<(.+)>$/.exec((p.type ?? '').trim());
            const inner = m ? m[1].trim() : null;
            const baseName = p.name.endsWith('Changed') ? p.name.slice(0, -'Changed'.length) : null;
            const base = baseName && propParam[baseName];
            let cs, call;
            if (base && !ev.native) {
                const src = pickField(ev, mapping.model && base.p.prop === mapping.model.prop ? mapping.model.key : null);
                const conv = src && convert(`e.${src.prop}`, src.cs, base.cs);
                if (!conv) { skip(p.name, `cannot turn the ${p.event} detail into ${base.cs}`); continue; }
                declare({ name: p.name, kind: 'param', cs: `EventCallback<${base.cs}>`, doc: `Raised with the new value of ${baseName} (two-way: ${baseName} follows it).`, note: p.note });
                addBind(base, { event: p.event, conv }, p.name, true);
                continue;
            }
            if (ev.native) { cs = `EventCallback<${p.type?.includes('MouseEventArgs') || ev.args === 'MouseEventArgs' ? 'MouseEventArgs' : 'EventArgs'}>`; call = 'args'; }
            else if (inner && !/EventArgs$/.test(inner) && (SIMPLE.has(stripNull(inner)))) {
                const src = pickField(ev, null);
                const conv = src && convert(`e.${src.prop}`, src.cs, inner);
                if (!conv) { skip(p.name, `cannot turn the ${p.event} detail into ${inner}`); continue; }
                cs = `EventCallback<${inner}>`; call = `value:${conv}`;
            } else if (!ev.fields.length) { cs = 'EventCallback'; call = 'none'; }
            else { cs = `EventCallback<${ev.args}>`; call = 'args'; }
            if (declare({ name: p.name, kind: 'param', cs, doc: ev.description, note: p.note, cancelable: ev.cancelable })) handler(ev).callbacks.push({ name: p.name, call });
        } else if (map === 'cssProperty') {
            skip(p.name, `sets the ${p.cssProperty} custom property; an inline style is blocked by the CSP, so it needs a CSSOM helper`);
        } else if (map === 'wrapper') {
            if (p.name === 'ExtraClass') { declare({ name: 'ExtraClass', kind: 'param', cs: 'string?', doc: 'Extra CSS classes for the element.' }); out.usesClass = true; }
            else if (p.name === 'AdditionalAttributes') out.usesAttributes = true; // every component has it, from PkElementBase
            else skip(p.name, p.todo ? `${p.todo}` : `wrapper behaviour, not a property of the element (${p.note})`);
        }
    }

    // ---- 3. the model block: the param whose prop is model.prop is two-way through model.event
    if (mapping.model) {
        const r = resolved.find(x => x.map === 'prop' && x.p.prop === mapping.model.prop && x.cs);
        if (r) {
            const ev = eventInfo(mapping.model.event);
            if (ev) {
                noteEvent(ev, comp);
                const src = ev.fields.find(f => f.key === mapping.model.key);
                const conv = src && convert(`e.${src.prop}`, src.cs, r.cs);
                if (conv) addBind(r, { event: mapping.model.event, field: src, conv }, `${r.name}Changed`, false);
                else skip(`${r.name}Changed`, `the model event ${mapping.model.event} has no field "${mapping.model.key}" convertible to ${r.cs}`);
            }
        }
    }
    return out;

    // bind: a param follows an event. `changedName`: the callback that reports it (declared here when the mapping did not list it).
    function addBind(r, b, changedName = `${r.name}Changed`, declaredAlready = false) {
        const ev = eventInfo(b.event);
        if (!ev) return;
        noteEvent(ev, comp);
        const h = handler(ev);
        let assign;
        if (b.literal !== undefined) assign = typeof b.literal === 'boolean' ? String(b.literal) : JSON.stringify(b.literal);
        else if (b.conv) assign = b.conv;
        else {
            const src = ev.fields.find(f => f.key.toLowerCase() === String(b.path).toLowerCase());
            const conv = src && convert(`e.${src.prop}`, src.cs, r.cs);
            if (!conv) { out.todo.push({ component: comp, param: r.name, reason: `cannot bind ${r.name} to ${b.event} (${b.path}) as ${r.cs}` }); return; }
            assign = conv;
        }
        if (h.updates.some(u => u.param === r.name)) return;
        h.updates.push({ param: r.name, assign, changed: changedName });
        if (!declaredAlready && !declared.has(changedName)) {
            if (names.has(changedName)) { /* the mapping lists it as its own parameter; it is declared when that entry is reached */ }
            else declare({ name: changedName, kind: 'param', cs: `EventCallback<${r.cs}>`, doc: `Raised when ${r.name} changes (two-way binding: <c>@bind-${r.name}</c>).` });
        }
    }
}

function pickField(ev, key) {
    if (key) { const f = ev.fields.find(x => x.key === key); if (f) return f; }
    if (ev.fields.length === 1) return ev.fields[0];
    return ev.fields.find(f => f.key === 'value') ?? null;
}

/** The C# type and the attribute expression of a prop parameter. */
function resolveProp(el, p, r, comp, enumType, todo, types = new Set()) {
    const api = el.props.find(x => x.name === p.prop);
    if (!api) return { ...r, reason: `the element has no prop ${p.prop}` };
    r.api = api;
    const t = p.type?.trim();
    const hasDefault = p.default !== undefined;
    const enumValues = () => p.enum ? Object.entries(p.enum).map(([n, v]) => [n, v]) : (api.type === 'enum' ? api.values.map(v => [memberName(v), v]) : null);
    let cs, attr, init, note;

    if (p.enum || (api.type === 'enum' && t === undefined)) {
        const typeName = t && !SIMPLE.has(stripNull(t)) ? stripNull(t) : `${comp}${pascal(p.name)}`;
        enumType(typeName, enumValues(), comp);
        const members = enumValues();
        const def = hasDefault ? members.find(([n, v]) => n.toLowerCase() === String(p.default).toLowerCase() || String(v).toLowerCase() === String(p.default).toLowerCase()) : null;
        cs = def ? typeName : typeName + '?';
        if (def) init = `${typeName}.${def[0]}`;
        attr = 'enum';
        r.expr = def ? `@(${p.name}.ToAttr())` : `@(${p.name}?.ToAttr())`;
        if (p.todo) note = `${p.todo} (generated from the mapping's enum)`;
    } else if (t === undefined) {
        // No mapping type: derive from the SDK prop.
        if (api.type === 'boolean') { cs = 'bool'; attr = 'bool'; }
        else if (api.type === 'number') { cs = 'double?'; attr = 'num'; }
        else if (api.type === 'json') { cs = 'object?'; attr = 'json'; r.todo = p.todo ?? 'a JSON prop with no mapping type: give it a public record in PlainKit.Blazor and name it as the mapping type (issue #77)'; }
        else { cs = 'string?'; attr = 'str'; }
    } else {
        const base = stripNull(t);
        if (base === 'string') { cs = 'string?'; attr = 'str'; if (hasDefault) init = lit(p.default); }
        else if (base === 'bool') {
            cs = 'bool'; attr = 'bool'; if (p.default === true) init = 'true';
            // `invert`: the parameter says the opposite of the prop (Boxed is not plain, ShowCloseButton is not hideClose); it is sent negated, still as a plain attribute.
            if (p.invert) r.expr = `@(!${p.name})`;
        }
        else if (NUMERIC.has(base)) {
            // A plain `int` is non-nullable and starts at the element's own default (the mapping's, else the API's), so binding it needs no cast and
            // sending it always changes nothing; `int?` stays nullable and is sent only when set.
            const start = typeof p.default === 'number' ? p.default : typeof api.default === 'number' ? api.default : null;
            if (t.endsWith('?') || start === null) { cs = base + '?'; } else { cs = base; init = String(start); }
            attr = 'num';
        }
        else if (base === 'DateOnly') { cs = 'DateOnly?'; attr = 'date'; }
        else if (isJsonType(t, api.type === 'json' ? types : undefined)) { cs = base + '?'; attr = 'json'; }
        else if (api.type === 'enum' && /^[A-Z][A-Za-z0-9]*$/.test(base)) {
            enumType(base, api.values.map(v => [memberName(v), v]), comp);
            const def = hasDefault ? api.values.find(v => v.toLowerCase() === String(p.default).toLowerCase() || memberName(v).toLowerCase() === String(p.default).toLowerCase()) : null;
            cs = def !== undefined && def !== null ? base : base + '?'; attr = 'enum';
            if (def !== undefined && def !== null) init = `${base}.${memberName(def)}`;
            r.expr = def !== undefined && def !== null ? `@(${p.name}.ToAttr())` : `@(${p.name}?.ToAttr())`;
        } else {
            // A type this repository does not define (issue #9): keep the value as an object, sent as JSON, and list it.
            cs = 'object?'; attr = 'json';
            r.todo = p.todo ?? `type not yet defined in PlainKit.Blazor (issue #9): ${base}`;
        }
    }
    if (p.todo && !r.todo && attr !== 'enum') r.todo = p.todo;
    r.cs = cs; r.attr = attr; r.init = init; r.note = note;
    r.expr ??= attr === 'bool' || attr === 'str' ? `@${p.name}` : attr === 'num' ? `@PkAttr.Num(${p.name})` : attr === 'date' ? `@PkAttr.Date(${p.name})` : `@PkAttr.Json(${p.name})`;
    return r;
}

// ---------------------------------------------------------------- rendering

const doc = (text, indent = '    ') => `${indent}/// <summary>${esc(text) || '&#160;'}</summary>`;

export function renderComponent(m, mappingName) {
    const L = [];
    L.push(`@* Generated by ${GENERATOR} from core/dist/elements/api.json and blazor/mappings/${mappingName}.json. Do not edit: change the mapping or the SDK and run it again. *@`);
    L.push('@namespace PlainKit.Blazor', '@using Microsoft.AspNetCore.Components.Web', '@inherits PkElementBase', '');
    // The element. Blazor's own `@onclick` syntax cannot name an event with a hyphen (`@onpk-close` is taken as a plain attribute), so the pk-* events
    // go in a dictionary that is splatted on the element; the value is an EventCallback and the name is the on-prefixed event (registered in
    // PkGeneratedEvents.cs). Native events (click) use the normal syntax.
    const live = [...m.handlers.values()].filter(h => h.updates.length || h.callbacks.length);
    const custom = live.filter(h => !h.native);
    const attrs = [];
    for (const a of m.attrs) attrs.push(`${a.attr}="${a.expr}"`);
    // The element itself (PkElementBase.Element), for PkRuntime.ReadFormValuesAsync and any host that needs a JavaScript handle.
    attrs.push('@ref="Element"');
    for (const h of live.filter(x => x.native)) attrs.push(`@${h.attr}="${handlerName(h)}"`);
    // Every component takes the attributes it has no parameter for (PkElementBase.AdditionalAttributes): `class` is merged with ExtraClass, the rest
    // is splatted after the generated attributes together with the pk-* event handlers (built once per component, see PkElementBase).
    attrs.push(`class="@Css(${m.usesClass ? 'ExtraClass' : ''})"`);
    attrs.push('@attributes="Splat"');
    const children = m.children.map(c => (c.slot === '' ? `@${c.name}` : `@if (${c.name} is not null) {<span slot=${lit(c.slot)}>@${c.name}</span>}`)).join('');
    if (attrs.length === 0) L.push(`<${m.tag}>${children}</${m.tag}>`);
    else {
        const pad = ' '.repeat(m.tag.length + 2);
        L.push(`<${m.tag} ${attrs[0]}${attrs.length > 1 ? '' : `>${children}</${m.tag}>`}`);
        for (let i = 1; i < attrs.length; i++) L.push(`${pad}${attrs[i]}${i === attrs.length - 1 ? `>${children}</${m.tag}>` : ''}`);
    }
    L.push('', '@code {');
    m.params.forEach((d, i) => {
        if (i) L.push('');
        L.push(doc(d.doc));
        if (d.note) L.push(`    /// <remarks>${esc(d.note)}</remarks>`);
        if (d.cancelable) L.push('    /// <remarks>The event can be cancelled in the browser (preventDefault); a callback cannot cancel it.</remarks>');
        L.push(`    [Parameter] public ${d.cs} ${d.name} { get; set; }${d.init ? ` = ${d.init};` : d.cs === 'string' ? ' = "";' : ''}`);
    });
    if (custom.length) {
        // Called once by PkElementBase, not on every parameter change: the handlers do not depend on the parameters.
        L.push('', '    /// <inheritdoc />', '    protected override void AddEventHandlers(Dictionary<string, object> handlers)', '    {');
        for (const h of custom) L.push(`        handlers[${lit(h.attr)}] = EventCallback.Factory.Create<${h.args}>(this, ${handlerName(h)});`);
        L.push('    }');
    }
    for (const h of live) {
        L.push('');
        L.push(`    private async Task ${handlerName(h)}(${h.args} e)`, '    {');
        for (const u of h.updates) L.push(`        ${u.param} = ${u.assign};`);
        for (const u of h.updates) L.push(`        await ${u.changed}.InvokeAsync(${u.param});`);
        for (const c of h.callbacks) {
            if (c.call === 'args') L.push(`        await ${c.name}.InvokeAsync(e);`);
            else if (c.call === 'none') L.push(`        await ${c.name}.InvokeAsync();`);
            else L.push(`        await ${c.name}.InvokeAsync(${c.call.slice('value:'.length)});`);
        }
        L.push('    }');
    }
    L.push('}');
    return L.join('\n') + '\n';
}
const handlerName = h => 'Handle' + pascal(h.attr.replace(/^on/, ''));

export function renderEnums(enums) {
    const L = ['// Generated by ' + GENERATOR + ' from the element API and blazor/mappings. Do not edit.', '', 'namespace PlainKit.Blazor;', ''];
    const list = [...enums.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const e of list) {
        L.push(`/// <summary>The values of the ${esc(e.owners.join(', '))} parameter${e.owners.length > 1 ? 's' : ''} that use it. Each member is one attribute value of the element.</summary>`, `public enum ${e.name}`, '{');
        for (const m of e.members) L.push(`    /// <summary><c>${esc(m.value)}</c></summary>`, `    ${m.name},`);
        L.push('}', '');
    }
    L.push('internal static class PkGeneratedEnumAttributes', '{');
    for (const e of list) {
        L.push(`    internal static string ToAttr(this ${e.name} value) => value switch`, '    {');
        for (const m of e.members) L.push(`        ${e.name}.${m.name} => ${lit(m.value)},`);
        L.push('        _ => throw new ArgumentOutOfRangeException(nameof(value)),', '    };', '');
    }
    if (list.length) L.pop();
    L.push('}');
    return L.join('\n') + '\n';
}

export function renderEvents(events, names) {
    const list = [...events.values()].sort((a, b) => a.args.localeCompare(b.args));
    const L = ['// Generated by ' + GENERATOR + ' from the element API and blazor/mappings. Do not edit.', '', 'using System.Text.Json;', 'using Microsoft.AspNetCore.Components;', '', 'namespace PlainKit.Blazor;', ''];
    L.push('/// <summary>A file the user chose or dropped, as the element reports it. The bytes stay in the browser: read a file with the Blazor <c>InputFile</c> component.</summary>', 'public sealed class PkFileInfo', '{',
        '    /// <summary>The file name.</summary>', '    public string? Name { get; set; }', '',
        '    /// <summary>The size in bytes.</summary>', '    public long? Size { get; set; }', '',
        '    /// <summary>The MIME type the browser reported.</summary>', '    public string? Type { get; set; }', '}', '');
    for (const e of list) {
        L.push(`/// <summary>The detail of <c>${e.name}</c>, raised by ${esc(e.owners.join(', '))}. A field is set only when the element sends it.</summary>`, `public class ${e.args} : EventArgs`, '{');
        [...e.fields.values()].forEach((f, i) => { if (i) L.push(''); L.push(`    /// <summary>The <c>${esc(f.key)}</c> field of the detail (<c>${esc(f.type)}</c>).</summary>`, `    public ${f.cs} ${f.prop} { get; set; }`); });
        L.push('}', '');
    }
    L.push('/// <summary>Registers every pk-* custom event of every element with Blazor (an <c>[EventHandler]</c> each), so <c>@onpk-...</c> works on a component and on a raw element such as <c>&lt;pk-table @onpk-sort="..."&gt;</c>; the browser side is <c>PlainKit.Blazor.lib.module.js</c>.</summary>');
    const argsOf = new Map(list.map(e => [e.name, e.args]));
    for (const n of [...names].sort()) L.push(`[EventHandler(${lit('on' + n)}, typeof(${argsOf.get(n) ?? 'EventArgs'}), enableStopPropagation: true, enablePreventDefault: true)]`);
    L.push('// The Razor compiler only discovers [EventHandler] attributes on a class named exactly EventHandlers (import the namespace: @using PlainKit.Blazor).', 'public static class EventHandlers', '{', '}');
    return L.join('\n') + '\n';
}

export function renderModule(names) {
    const list = [...names].sort();
    return `// Generated by ${GENERATOR} from the element API and blazor/mappings. Do not edit.
// A Razor class library initializer: Blazor loads it by name and calls it once it has started. It registers every pk-* custom event of every
// element (not only the ones a component listens for), so @onpk-... works in raw markup too (<pk-table @onpk-sort="...">): Blazor listens for the
// event and hands the handler its detail as a plain object. EventHandlers (PkGeneratedEvents.cs; the Razor compiler only finds a class NAMED EventHandlers) maps each one to its PkXxxEventArgs type.
const events = [
${list.map(n => `    '${n}',`).join('\n')}
];

// The detail, made safe to serialize: files become { name, size, type }, DOM nodes are dropped, depth is capped.
function plain(v, depth = 0) {
    if (v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v ?? undefined;
    if (typeof File !== 'undefined' && v instanceof File) return { name: v.name, size: v.size, type: v.type };
    if (typeof Node !== 'undefined' && v instanceof Node) return undefined;
    if (depth > 4) return undefined;
    if (Array.isArray(v)) return v.map(x => plain(x, depth + 1));
    if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x, depth + 1)]));
    return undefined;
}

function register(blazor) {
    for (const name of events) {
        try { blazor.registerCustomEventType(name, { createEventArgs: e => { const d = plain(e.detail); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } }); }
        catch { /* registered already (the page started Blazor twice, or registered it itself): the existing registration stays */ }
    }
}

export function afterStarted(blazor) { register(blazor); }
export function afterWebStarted(blazor) { register(blazor); }
`;
}

// ---------------------------------------------------------------- the whole run

/**
 * Everything the generator writes: Map(relative path from the repository root -> LF text), plus the report.
 * `mappings` is { name: mapping }, `handWritten` the component names that already exist as .razor files by hand.
 */
export function generate(api, mappings, handWritten = new Set(), types = new Set()) {
    const byTag = new Map(api.map(e => [e.tag, e]));
    const reg = { enums: new Map(), events: new Map(), eventNames: new Set(), types };
    const files = new Map();
    const generated = [], skipped = [], todo = [], notGenerated = [];
    for (const name of Object.keys(mappings).sort()) {
        const mapping = mappings[name];
        const el = byTag.get('pk-' + name);
        if (!el) throw new Error(`blazor/mappings/${name}.json has no element pk-${name} in api.json`);
        if (mapping.component !== pkName(el.tag)) throw new Error(`${name}: component ${mapping.component} is not ${pkName(el.tag)}`);
        const hand = handWritten.has(mapping.component);
        if (hand && !mapping.existing) throw new Error(`${mapping.component} exists by hand in Components/ but blazor/mappings/${name}.json is not marked "existing": true; mark it so the generator skips it`);
        if (mapping.existing) {
            skipped.push({ component: mapping.component, tag: el.tag, reason: hand ? 'hand-written in Components/' : 'existing: true in the mapping (kept by hand, not in this package yet)', handWritten: hand });
            // A hand-written component listens for the element's pk-* events too: register them (and their args classes) so Blazor delivers them.
            // Only the event registry is shared; the model itself is thrown away.
            if (hand) modelElement(el, mapping, { enums: new Map(), events: reg.events, eventNames: reg.eventNames, types });
            continue;
        }
        const m = modelElement(el, mapping, reg);
        files.set(`${mapping.component}.razor`, renderComponent(m, name));
        generated.push({ component: mapping.component, tag: el.tag, parameters: m.params.length });
        todo.push(...m.todo);
        notGenerated.push(...m.notGenerated);
    }
    // Every pk-* event of every element is registered and mapped, not only the ones a component listens for: raw markup such as
    // <pk-table @onpk-sort="..."> needs the [EventHandler] class and the browser-side registration too (issue #49).
    for (const el of api) for (const e of el.events ?? []) if (e.name.startsWith('pk-')) noteEventInto(reg, eventModel(e), pkName(el.tag));
    const extra = [...api].filter(e => !(e.tag.replace(/^pk-/, '') in mappings));
    if (extra.length) throw new Error(`elements without a mapping: ${extra.map(e => e.tag).join(', ')}`);
    files.set('PkGeneratedEnums.cs', renderEnums(reg.enums));
    files.set('PkGeneratedEvents.cs', renderEvents(reg.events, reg.eventNames));
    const manifest = {
        generator: GENERATOR,
        note: 'Generated. Lists what was generated and what was not, so a change to either shows in review; node scripts/generate-blazor.mjs --check compares it.',
        generated: generated.map(g => g.component),
        skipped,
        enums: [...reg.enums.values()].map(e => ({ name: e.name, members: e.members.map(x => x.name), usedBy: e.owners })).sort((a, b) => a.name.localeCompare(b.name)),
        events: [...reg.eventNames].sort(),
        typesToDefine: todo.sort((a, b) => (a.component + a.param).localeCompare(b.component + b.param)),
        notGenerated: notGenerated.sort((a, b) => (a.component + a.param).localeCompare(b.component + b.param)),
    };
    files.set('generated.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    return { files, moduleText: renderModule(reg.eventNames), report: { generated, skipped, todo, notGenerated, enums: reg.enums.size, events: reg.eventNames.size } };
}

export const crlf = s => s.replace(/\r?\n/g, '\r\n');

export function load() {
    const api = JSON.parse(fs.readFileSync(paths.api, 'utf8'));
    const mappings = Object.fromEntries(fs.readdirSync(paths.mappings).filter(f => f.endsWith('.json')).sort().map(f => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(paths.mappings, f), 'utf8'))]));
    const handWritten = new Set(fs.existsSync(paths.components) ? fs.readdirSync(paths.components).filter(f => f.endsWith('.razor') && !f.startsWith('_')).map(f => f.replace(/\.razor$/, '')) : []);
    return generate(api, mappings, handWritten, knownTypes(paths.package));
}

/** The files as they belong on disk: absolute path -> CRLF text. */
export function outputs(result) {
    const out = new Map();
    for (const [f, text] of result.files) out.set(path.join(paths.generated, f), crlf(text));
    out.set(paths.module, crlf(result.moduleText));
    return out;
}

/** What differs between the outputs and the disk: missing, changed, or extra files in Generated/. */
export function differences(out) {
    const d = [];
    for (const [f, text] of out) {
        const rel = path.relative(root, f).replaceAll('\\', '/');
        if (!fs.existsSync(f)) d.push(`missing: ${rel}`);
        else if (fs.readFileSync(f, 'utf8') !== text) d.push(`changed: ${rel}`);
    }
    if (fs.existsSync(paths.generated)) for (const f of fs.readdirSync(paths.generated)) if (!out.has(path.join(paths.generated, f))) d.push(`extra: blazor/src/PlainKit.Blazor/Generated/${f}`);
    return d;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (!fs.existsSync(paths.api)) { console.error('core/dist/elements/api.json does not exist: run node scripts/bootstrap.mjs first'); process.exit(2); }
    let result;
    try { result = load(); } catch (e) { console.error(`generate-blazor: ${e.message}`); process.exit(2); }
    const out = outputs(result);
    const r = result.report;
    if (process.argv.includes('--list')) {
        console.log(`generated ${r.generated.length}: ${r.generated.map(g => g.component).join(' ')}`);
        console.log(`skipped ${r.skipped.length}: ${r.skipped.map(s => `${s.component} (${s.reason})`).join('; ')}`);
        console.log(`types to define (issue #9) ${r.todo.length}:\n${r.todo.map(t => `  ${t.component}.${t.param}: ${t.reason}`).join('\n')}`);
        console.log(`parameters not generated ${r.notGenerated.length}:\n${r.notGenerated.map(t => `  ${t.component}.${t.param}: ${t.reason}`).join('\n')}`);
    } else if (process.argv.includes('--check')) {
        const d = differences(out);
        if (d.length) { console.error(`the generated Blazor wrappers are out of date (${d.length} differences); run node scripts/generate-blazor.mjs\n${d.slice(0, 15).join('\n')}`); process.exit(1); }
        console.log(`Generated/ matches the API and the mappings (${r.generated.length} components, ${r.skipped.length} skipped)`);
    } else {
        fs.mkdirSync(paths.generated, { recursive: true });
        for (const f of fs.readdirSync(paths.generated)) if (!out.has(path.join(paths.generated, f))) fs.rmSync(path.join(paths.generated, f));
        for (const [f, text] of out) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
        console.log(`${r.generated.length} components generated, ${r.skipped.length} skipped, ${r.enums} enums, ${r.events} events, ${r.todo.length} types to define, ${r.notGenerated.length} parameters not generated`);
    }
}
