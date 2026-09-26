// The pure parts of PkElement (no DOM): attribute/property naming, prop coercion and template bindings. Node-testable.

export const kebab = n => n.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
export const camel = n => n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// Property value from a raw attribute string (fromAttr) or an assigned value. A value that cannot be used (an enum outside its values, a
// number that is NaN, json that does not parse) falls back to the default; report(problem, fallback), when given, is told so the caller can log it.
// A missing value (null, undefined) and an empty number are not mistakes: the prop is just unset.
export function coerce(def, raw, fromAttr = false, report = null) {
    switch (def.type) {
        case 'boolean': return fromAttr ? raw != null && raw !== 'false' : !!raw;
        case 'number': {
            const n = Number(raw);
            if (raw == null || raw === '') return def.default;
            if (isNaN(n)) { report?.('is not a number', def.default); return def.default; }
            return n;
        }
        case 'enum':
            if (def.values.includes(raw)) return raw;
            if (raw != null) report?.(`is not one of ${def.values}`, def.default);
            return def.default;
        case 'json': {
            if (!fromAttr) return raw === undefined ? def.default : raw;
            try { return raw == null ? def.default : JSON.parse(raw); } catch { report?.('is not valid JSON', def.default); return def.default; }
        }
        default: return raw == null ? def.default : String(raw);
    }
}

// "Hello {{name}}, {{n|str}}" -> ['Hello ', {key:'name'}, ', ', {key:'n', str:true}]. |str keeps false/empty as text.
export function parseBindings(text) {
    const parts = []; let last = 0;
    for (const m of text.matchAll(/\{\{\s*([\w.]+)(\|str)?\s*\}\}/g)) {
        if (m.index > last) parts.push(text.slice(last, m.index));
        parts.push({ key: m[1], str: !!m[2] }); last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

// The value of a bound text or attribute: a lone binding on an attribute removes it for false/null/undefined and sets '' for true.
export function bindValue(parts, values, isAttr = false) {
    const lone = parts.length === 1 && typeof parts[0] === 'object' && !parts[0].str;
    if (isAttr && lone) { const v = values[parts[0].key]; return v === false || v == null || v === '' ? null : v === true ? '' : String(v); }
    return parts.map(p => (typeof p === 'string' ? p : String(values[p.key] ?? ''))).join('');
}
