// js/field-conditions.js: the declarative condition syntax of a field spec (#1282), loaded by pk-field-group only when a spec declares one (whenExpr, disabledExpr,
// readonlyExpr, requiredExpr, or `when` given as a string). It is parsed by hand into a closure tree: no eval, no Function, so it runs under the site's CSP.
//   expr    := or ;  or := and ('||' and)* ;  and := not ('&&' not)* ;  not := '!' not | cmp
//   cmp     := value (('==' | '!=' | '<' | '<=' | '>' | '>=') value | 'in' '[' value (',' value)* ']')?
//   value   := field-key | 'text' | "text" | number | true | false | '(' expr ')'
// A field key is the key of another spec; its value is the committed one ('' when empty, true/false for a checkbox or switch). A bare value is true when it is
// not empty, not false and not 0. == and != compare as text, as the data `when` does, except that two numbers compare as numbers; < and friends compare numbers
// when both are numbers, else text. There are no function calls and no member access.
const cache = new Map();
const text = v => (v === undefined || v === null ? '' : String(v));
const num = v => (v === '' || v === null || v === undefined || typeof v === 'boolean' ? NaN : Number(v));
const truthy = v => !(v === '' || v === false || v === 0 || v === undefined || v === null || v === 'false');
const eq = (a, b) => { const x = num(a), y = num(b); return Number.isNaN(x) || Number.isNaN(y) ? text(a) === text(b) : x === y; };
const order = (a, b) => { const x = num(a), y = num(b); return Number.isNaN(x) || Number.isNaN(y) ? (text(a) < text(b) ? -1 : text(a) > text(b) ? 1 : 0) : Math.sign(x - y); };

function tokens(src) {
    const out = [], re = /\s*(?:(==|!=|<=|>=|&&|\|\||[<>!()\[\],])|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(-?\d+(?:\.\d+)?)|([A-Za-z_][\w.-]*))/y;
    let at = 0;
    while (at < src.length) {
        if (/^\s*$/.test(src.slice(at))) break;
        re.lastIndex = at;
        const m = re.exec(src);
        if (!m) throw new Error(`unexpected "${src.slice(at).trim()[0]}"`);
        at = re.lastIndex;
        if (m[1]) out.push({ op: m[1] });
        else if (m[2] !== undefined || m[3] !== undefined) out.push({ lit: (m[2] ?? m[3]).replace(/\\(.)/g, '$1') });
        else if (m[4]) out.push({ lit: Number(m[4]) });
        else if (m[5] === 'true' || m[5] === 'false') out.push({ lit: m[5] === 'true' });
        else if (m[5] === 'in') out.push({ op: 'in' });
        else out.push({ key: m[5] });
    }
    return out;
}

/** Parses an expression into { run(values) -> boolean, keys: [field keys it reads] }; throws an Error with a message that says what is wrong. */
export function parse(src) {
    let hit = cache.get(src);
    if (hit) return hit;
    const t = tokens(String(src)), keys = new Set();
    let i = 0;
    const op = o => t[i]?.op === o && (i++, true);
    const need = o => { if (!op(o)) throw new Error(`expected "${o}"`); };
    const value = () => {
        const k = t[i++];
        if (!k) throw new Error('the expression ends too soon');
        if ('lit' in k) return () => k.lit;
        if ('key' in k) { keys.add(k.key); return v => v[k.key]; }
        if (k.op === '(') { const e = or(); need(')'); return e; }
        throw new Error(`unexpected "${k.op}"`);
    };
    const cmp = () => {
        const a = value();
        if (op('in')) { need('['); const list = [value()]; while (op(',')) list.push(value()); need(']'); return v => { const x = a(v); return list.some(b => eq(x, b(v))); }; }
        for (const o of ['==', '!=', '<=', '>=', '<', '>']) if (op(o)) {
            const b = value(), f = { '==': (x, y) => eq(x, y), '!=': (x, y) => !eq(x, y), '<': (x, y) => order(x, y) < 0, '<=': (x, y) => order(x, y) <= 0, '>': (x, y) => order(x, y) > 0, '>=': (x, y) => order(x, y) >= 0 }[o];
            return v => f(a(v), b(v));
        }
        return v => truthy(a(v));
    };
    const not = () => (op('!') ? (e => v => !e(v))(not()) : cmp());
    const and = () => { let a = not(); while (op('&&')) a = ((l, r) => v => l(v) && r(v))(a, not()); return a; };
    const or = () => { let a = and(); while (op('||')) a = ((l, r) => v => l(v) || r(v))(a, and()); return a; };
    const run = or();
    if (i < t.length) throw new Error(`unexpected "${t[i].op ?? t[i].key ?? t[i].lit}"`);
    hit = { run: v => Boolean(run(v ?? {})), keys: [...keys] };
    cache.set(src, hit);
    return hit;
}

/**
 * Evaluates one expression against the values. `known` is the set of field keys; a key outside it, or a syntax error, is reported to `warn(message)` (once per
 * expression, the caller's own warn-once) and the answer is `fallback` (true for visibility, false for the others).
 */
export function evaluate(src, values, known, fallback, warn) {
    let p;
    try { p = parse(src); } catch (e) { warn(`condition "${src}" is not valid: ${e.message}`); return fallback; }
    const bad = p.keys.find(k => !known.has(k));
    if (bad) { warn(`condition "${src}" names the unknown field "${bad}"`); return fallback; }
    return p.run(values);
}
