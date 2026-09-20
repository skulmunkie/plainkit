// The pure parts of PkElement (no DOM): attribute/property naming, prop coercion and template bindings. Node-testable.

export const kebab = n => n.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
export const camel = n => n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// Property value from a raw attribute string (fromAttr) or an assigned value.
export function coerce(def, raw, fromAttr = false) {
    switch (def.type) {
        case 'boolean': return fromAttr ? raw !== null && raw !== 'false' : Boolean(raw);
        case 'number': { const n = Number(raw); return raw === null || raw === '' || raw === undefined || Number.isNaN(n) ? def.default : n; }
        case 'enum': return def.values.includes(raw) ? raw : def.default;
        case 'json': { if (!fromAttr) return raw === undefined ? def.default : raw; try { return raw === null ? def.default : JSON.parse(raw); } catch { return def.default; } }
        default: return raw === null || raw === undefined ? def.default : String(raw);
    }
}

// "Hello {{name}}, {{n|str}}" -> ['Hello ', {key:'name'}, ', ', {key:'n', str:true}]. |str keeps false/empty as text.
export function parseBindings(text) {
    const parts = []; let last = 0;
    for (const m of text.matchAll(/\{\{\s*([\w.]+)(\|str)?\s*\}\}/g)) {
        if (m.index > last) parts.push(text.slice(last, m.index));
        parts.push({ key: m[1], str: Boolean(m[2]) }); last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

// The value of a bound text or attribute: a lone binding on an attribute removes it for false/null/undefined and sets '' for true.
export function bindValue(parts, values, isAttr = false) {
    const lone = parts.length === 1 && typeof parts[0] === 'object' && !parts[0].str;
    if (isAttr && lone) { const v = values[parts[0].key]; return v === false || v === null || v === undefined || v === '' ? null : v === true ? '' : String(v); }
    return parts.map(p => (typeof p === 'string' ? p : String(values[p.key] ?? ''))).join('');
}
