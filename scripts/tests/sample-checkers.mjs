// The sample checkers: what makes a code sample in a document real. Shared by scripts/tests/skills.test.mjs (the agent skills) and scripts/tests/guides.test.mjs
// (the Guides): SDK markup uses only real pk-* tags, props, slots and enum values from api.json; Razor and C# use only real Pk* components, parameters, enums,
// options and methods from the generated components and the C# sources; JavaScript parses and imports only real exports of dist with real mount options.
// No tests in this file: importing it runs nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { collect, exportsOf, root } from '../build-skills.mjs';
import { kebab } from '../generate-blazor.mjs';

export const src = collect();
export const dist = path.join(root, 'core', 'dist');
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
export const byTag = new Map(src.api.map(e => [e.tag, e]));

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const OPTIONAL_END = new Set(['p', 'li', 'option', 'dt', 'dd', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot']);
const GLOBAL_ATTR = new Set(['id', 'class', 'slot', 'hidden', 'role', 'title', 'lang', 'dir', 'tabindex', 'part', 'inert', 'draggable', 'autofocus', 'is']);

/** Tags of a piece of markup: { close, name, attrs: [[name, value]], self, at }. Comments and script/style bodies are skipped. */
export function scanTags(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
        const lt = source.indexOf('<', i);
        if (lt < 0) break;
        if (source.startsWith('<!--', lt)) { const e = source.indexOf('-->', lt); i = e < 0 ? source.length : e + 3; continue; }
        if (source.startsWith('<!', lt)) { const e = source.indexOf('>', lt); i = e < 0 ? source.length : e + 1; continue; }
        const m = /^<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/.exec(source.slice(lt));
        if (!m) { i = lt + 1; continue; }
        const attrs = [];
        const attrText = m[3].replace(/\/\s*$/, '');
        for (const a of attrText.matchAll(/([^\s=\/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs.push([a[1], a[2] ?? a[3] ?? a[4] ?? null]);
        tokens.push({ close: m[1] === '/', name: m[2], attrs, self: /\/\s*$/.test(m[3]), at: lt });
        i = lt + m[0].length;
        const lower = m[2].toLowerCase();
        if (!m[1] && (lower === 'script' || lower === 'style')) { const e = source.toLowerCase().indexOf(`</${lower}`, i); i = e < 0 ? source.length : e; }
    }
    return tokens;
}

/** Problems in SDK markup (`razor` also allows @-expressions in values): balanced tags, real pk-* elements, real props, slots and enum values. */
export function checkHtml(source, { api = byTag, razor = false, skipTags = () => false } = {}) {
    const problems = [];
    const stack = [];
    for (const t of scanTags(source)) {
        const lower = t.name.toLowerCase();
        if (razor && /^[A-Z]/.test(t.name)) continue;
        if (t.close) {
            const at = stack.map(s => s.lower).lastIndexOf(lower);
            if (at < 0) problems.push(`</${t.name}> closes nothing`);
            else { for (const s of stack.splice(at)) if (s.lower !== lower && !OPTIONAL_END.has(s.lower)) problems.push(`<${s.name}> is not closed before </${t.name}>`); }
            continue;
        }
        const parent = stack.at(-1);
        if (lower.startsWith('pk-') && !skipTags(t)) {
            const el = api.get(lower);
            if (!el) problems.push(`unknown element <${t.name}>`);
            else {
                const props = new Map(el.props.map(p => [kebab(p.name), p]));
                for (const [name, value] of t.attrs) {
                    const n = name.toLowerCase();
                    if (n === 'style') { problems.push(`<${lower}> has a style attribute`); continue; }
                    if (n.startsWith('aria-') || n.startsWith('data-') || GLOBAL_ATTR.has(n) || n.startsWith('@')) {
                        if (n === 'slot') checkSlot(lower, el, value, parent, problems);
                        continue;
                    }
                    const p = props.get(n);
                    if (!p) { problems.push(`<${lower}> has no prop "${name}"`); continue; }
                    if (value === null || (razor && /^@|@\(/.test(value))) continue;
                    if (p.type === 'enum' && !p.values.includes(value)) problems.push(`<${lower}> ${name}="${value}" is not one of ${p.values.join('|')}`);
                    if (p.type === 'number' && !Number.isFinite(Number(value))) problems.push(`<${lower}> ${name}="${value}" is not a number`);
                    if (p.type === 'json') { try { JSON.parse(value); } catch { problems.push(`<${lower}> ${name} is not valid JSON`); } }
                }
            }
        }
        // A slot on a child of a pk-* element is checked on the child, whatever the child is.
        if (!lower.startsWith('pk-') && parent?.lower.startsWith('pk-')) {
            const slot = t.attrs.find(([n]) => n === 'slot');
            if (slot && api.get(parent.lower)) checkSlot(lower, null, slot[1], parent, problems, parent.lower);
        }
        if (!VOID.has(lower) && !t.self) stack.push({ lower, name: t.name });
    }
    for (const s of stack) if (!OPTIONAL_END.has(s.lower)) problems.push(`<${s.name}> is never closed`);
    return problems;
}

function checkSlot(tag, el, value, parent, problems, parentTag = parent?.lower) {
    if (!parentTag?.startsWith('pk-')) { problems.push(`<${tag} slot="${value}"> is not a direct child of a pk-* element`); return; }
    const owner = byTag.get(parentTag);
    if (!owner) return;
    const names = owner.slots.map(s => s.name);
    if (names.includes(value)) return;
    // A slot the element names per row (cell-<rowId>-<key>, detail-<rowId>) is listed as a pattern in its meta.
    if (owner.slots.some(s => s.dynamic && new RegExp('^' + s.name.replace(/<[^>]+>/g, '[\\w.-]+') + '$').test(value))) return;
    problems.push(`<${parentTag}> has no slot "${value}" (it has: ${names.map(n => n || '(default)').join(', ')})`);
}

const isKnownEnum = new Map([...src.manifest.enums.map(e => [e.name, e.members]), ...src.enums.map(e => [e.name, e.members])]);
const csFiles = fs.readdirSync(path.join(root, 'blazor', 'src', 'PlainKit.Blazor'), { recursive: true }).filter(f => f.endsWith('.cs') && !/[\\/](bin|obj)[\\/]/.test(f));
const csText = csFiles.map(f => read(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', f))).join('\n');
export const knownTypes = new Set([...csText.matchAll(/public (?:sealed |static |abstract )*(?:partial )?(?:class|record|interface|enum|struct) (\w+)/g)].map(m => m[1]));
for (const c of Object.keys(src.razor)) knownTypes.add(c);
const memberNames = ms => new Set(ms.map(m => /(\w+)\s*(?:\(|$)/.exec(m.decl.replace(/\(.*$/, ''))?.[1]).filter(Boolean));
const optionMembers = memberNames(src.cs.options), loggingMembers = memberNames(src.cs.logging), ipklogMembers = memberNames(src.cs.ipklog), runtimeMembers = memberNames(src.cs.runtime);

/** Problems in Razor markup: real Pk* components, real parameters, real bind pairs, real enum members, plus the raw pk-* tags as in SDK markup. */
export function checkRazor(source) {
    const problems = [];
    const markup = source.replace(/@\*[\s\S]*?\*@/g, '').replace(/@code\s*\{[\s\S]*$/, '');
    const stack = [];
    const raw = [];
    for (const t of scanTags(markup)) {
        if (!/^[A-Z]/.test(t.name)) { raw.push(t); continue; }
        if (t.close) { while (stack.length && stack.pop().name !== t.name); continue; }
        const comp = /^Pk[A-Z]/.test(t.name) ? t.name : null;
        if (comp) {
            const c = src.razor[comp];
            if (!c) { problems.push(`unknown component <${comp}>`); }
            else {
                const names = new Set([...c.params.map(p => p.name), ...(c.typeParams ?? [])]);   // a generic component takes its @typeparam as an attribute (TItem="Order")
                for (const [attr, value] of t.attrs) {
                    if (/^@(ref|key|attributes|rendermode)$/.test(attr)) continue;
                    const bind = /^@bind-(\w+)(?::(?:event|after|get|set|format))?$/.exec(attr);
                    const name = bind ? bind[1] : attr;
                    if (!names.has(name)) { problems.push(`<${comp}> has no parameter "${name}"`); continue; }
                    if (bind && !names.has(name + 'Changed')) problems.push(`<${comp}> ${name} has no ${name}Changed, so it cannot be bound`);
                    const en = /^(\w+)\.(\w+)$/.exec(value ?? '');
                    if (en && isKnownEnum.has(en[1]) && !isKnownEnum.get(en[1]).includes(en[2])) problems.push(`${value} is not a member of ${en[1]}`);
                }
            }
            if (!t.self) stack.push({ name: t.name, comp });
        } else if (!t.self) {
            // A fragment tag (<ChildContent>) is a parameter of the component around it.
            const owner = [...stack].reverse().find(s => s.comp);
            const c = owner && src.razor[owner.comp];
            if (c && !t.close && stack.at(-1)?.comp === owner.comp && !c.params.some(p => p.name === t.name)) problems.push(`<${owner.comp}> has no fragment "${t.name}"`);
            stack.push({ name: t.name });
        }
    }
    // The raw pk-* tags, checked as SDK markup: only the tags that are not inside Blazor components are complete markup, so rebuild them.
    const rawText = raw.map(t => `<${t.close ? '/' : ''}${t.name}${t.attrs.map(([n, v]) => (v === null ? ` ${n}` : ` ${n}="${v.replace(/"/g, '&quot;')}"`)).join('')}${t.self ? ' /' : ''}>`).join('');
    const rawProblems = checkHtml(rawText, { razor: true }).filter(p => !/is never closed|closes nothing/.test(p) && !/is not a direct child/.test(p));
    return [...problems, ...rawProblems];
}

/** Problems in C# or Razor code text: every Pk* type, enum member and option member it names must exist. */
export function checkCode(text) {
    const problems = [];
    const declared = new Set([...text.matchAll(/@inject\s+\w+\s+(\w+)/g)].map(m => m[1]));
    for (const m of text.matchAll(/\b(I?Pk[A-Z]\w*)\b/g)) if (!knownTypes.has(m[1]) && !declared.has(m[1])) problems.push(`unknown type ${m[1]}`);
    for (const m of text.matchAll(/\b([A-Z]\w+)\.([A-Z]\w+)\b/g)) if (isKnownEnum.has(m[1]) && !isKnownEnum.get(m[1]).includes(m[2])) problems.push(`${m[1]}.${m[2]} is not an enum member`);
    for (const m of text.matchAll(/\bo\.Logging\.(\w+)/g)) if (!loggingMembers.has(m[1])) problems.push(`PkLoggingOptions has no ${m[1]}`);
    for (const m of text.matchAll(/\bo\.(?!Logging\b)(\w+)\s*=/g)) if (!optionMembers.has(m[1])) problems.push(`PkOptions has no ${m[1]}`);
    for (const m of text.matchAll(/\bPkLog\.(\w+)/g)) if (declared.has('PkLog') && !ipklogMembers.has(m[1])) problems.push(`IPkLog has no ${m[1]}`);
    for (const m of text.matchAll(/\bRuntime\.(\w+)/g)) if (declared.has('Runtime') && !runtimeMembers.has(m[1])) problems.push(`PkRuntime has no ${m[1]}`);
    for (const m of text.matchAll(/\.(AddPlainKit\w*)\(/g)) if (!new RegExp(`static \\w+(?:<\\w+>)? ${m[1]}\\(`).test(csText.replace(/\s+/g, ' '))) problems.push(`no method ${m[1]}`);
    return problems;
}

const DIST_PREFIX = './plainkit/';
/** Problems in a JavaScript sample: it parses as a module, and its imports and mount options are real. */
export function checkJs(code) {
    const problems = [];
    const tmp = path.join(os.tmpdir(), `pk-skill-${crypto.randomBytes(6).toString('hex')}.mjs`);
    fs.writeFileSync(tmp, code);
    try {
        const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
        if (r.status !== 0) problems.push(`does not parse: ${r.stderr.split('\n').find(l => /Error/.test(l)) ?? r.stderr.slice(0, 200)}`);
    } finally { fs.rmSync(tmp, { force: true }); }
    for (const m of code.matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from\s*'([^']+)'/g)) {
        if (!m[3].startsWith(DIST_PREFIX)) { problems.push(`import from ${m[3]} is not from ${DIST_PREFIX}`); continue; }
        const file = path.join(dist, m[3].slice(DIST_PREFIX.length));
        if (!fs.existsSync(file)) { problems.push(`${m[3]} does not exist in dist`); continue; }
        const have = exportsOf(file);
        for (const n of (m[2] ?? '').split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!have.includes(n)) problems.push(`${m[3]} does not export ${n}`);
        if (m[1] && !/^export default\b/m.test(read(file))) problems.push(`${m[3]} has no default export`);
    }
    for (const m of code.matchAll(/import\('([^']+)'\)/g)) if (!fs.existsSync(path.join(dist, m[1].replace(DIST_PREFIX, '')))) problems.push(`${m[1]} does not exist in dist`);
    for (const m of code.matchAll(/\b(mount\w+)\(\s*[^,()]+,\s*\{([^}]*)\}\s*\)/g)) {
        const mod = src.modules.find(x => x.mount === m[1]);
        if (!mod) { problems.push(`unknown ${m[1]}`); continue; }
        for (const k of m[2].matchAll(/(?:^|,)\s*(\w+)\s*:/g)) if (!new RegExp(`\\b${k[1]}\\b`).test(mod.header)) problems.push(`${m[1]} has no option ${k[1]}`);
    }
    for (const m of code.matchAll(/configureLogging\(\{([^]*?)\}\)/g)) {
        for (const k of m[1].matchAll(/\blevel:\s*'(\w+)'/g)) if (!['debug', 'info', 'warn', 'error', 'silent'].includes(k[1])) problems.push(`unknown level ${k[1]}`);
        for (const k of m[1].matchAll(/\b(\w+):\s*(?:\{|\[)/g)) if (!['scopes', 'routes', 'error', 'warn', 'info', 'debug'].includes(k[1])) problems.push(`unknown setting ${k[1]}`);
    }
    return problems;
}

