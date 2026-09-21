// The agent skills bundle (core/dist/skills, built by scripts/build-skills.mjs): current, deterministic, valid, complete, and every code sample in it
// verified against the sources of truth: the SDK samples parse as HTML and use only real pk-* tags, props, slots and enum values from api.json;
// the JavaScript samples parse and import only real exports with real options; the Razor and C# samples use only real Pk* components, parameters,
// enums and options from the generated components and the C# sources.
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { collect, generate, differences, diskFiles, crlf, exportsOf, parseFrontmatter, SKILL_NAMES, GROUP_FILES, EXAMPLE_ISSUES, groupSlug, csMembers, razorParams, csEnums, csEventArgs, headerComment, root } from '../build-skills.mjs';
import { kebab, pkName } from '../generate-blazor.mjs';

const src = collect();
const gen = generate(src);
const core = path.join(root, 'core');
const dist = path.join(core, 'dist');
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const byTag = new Map(src.api.map(e => [e.tag, e]));
const fencesOf = (text, langs) => [...text.matchAll(/```(\w*)\n([\s\S]*?)```/g)].filter(m => langs.includes(m[1])).map(m => ({ lang: m[1], text: m[2].replace(/\n$/, '') }));
const filesOf = skill => [...gen].filter(([f]) => f.startsWith(skill + '/'));

// ---------------------------------------------------------------- the checkers

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
const knownTypes = new Set([...csText.matchAll(/public (?:sealed |static |abstract )*(?:partial )?(?:class|record|interface|enum|struct) (\w+)/g)].map(m => m[1]));
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
                const names = new Set(c.params.map(p => p.name));
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

// ---------------------------------------------------------------- the bundle

test('the bundle on disk is what build-skills.mjs generates, byte for byte (CRLF); run node scripts/bootstrap.mjs when it fails', () => {
    assert.deepEqual(differences(gen), [], 'run node scripts/bootstrap.mjs');
});

test('the output is byte-deterministic', () => {
    const again = generate(collect());
    assert.deepEqual([...again.keys()], [...gen.keys()]);
    for (const [f, text] of gen) assert.equal(again.get(f), text, f);
});

test('the generator is LF internally and the files on disk are CRLF, as the repository requires for core/', () => {
    for (const [f, text] of gen) assert.ok(!text.includes('\r'), f);
    for (const [f, text] of diskFiles()) { assert.ok(text.includes('\r\n'), f); assert.ok(!/[^\r]\n/.test(text), `${f} has a bare LF`); assert.equal(text, crlf(gen.get(f)), f); }
});

test('the bundle is two skills, each a SKILL.md and references/', () => {
    const tops = new Set([...gen.keys()].map(f => f.split('/')[0]));
    assert.deepEqual([...tops].sort(), [...SKILL_NAMES].sort());
    for (const s of SKILL_NAMES) { assert.ok(gen.has(`${s}/SKILL.md`)); assert.ok([...gen.keys()].some(f => f.startsWith(`${s}/references/`))); }
    for (const f of gen.keys()) assert.ok(f.endsWith('SKILL.md') || f.startsWith(`${f.split('/')[0]}/references/`), f);
});

test('every file carries the version of core/VERSION, so a version bump regenerates the bundle', () => {
    const version = read(path.join(core, 'VERSION')).trim();
    assert.equal(src.version, version);
    for (const [f, text] of gen) assert.ok(text.includes(`Plainkit ${version}.`), `${f} is not stamped with ${version}`);
});

test('SKILL.md frontmatter is valid: name = folder, a description that says when to use it, short body', () => {
    for (const s of SKILL_NAMES) {
        const text = gen.get(`${s}/SKILL.md`);
        assert.ok(text.startsWith('---\n'), `${s}: frontmatter must be first`);
        const fm = parseFrontmatter(text);
        assert.deepEqual(Object.keys(fm).sort(), ['description', 'name']);
        assert.equal(fm.name, s);
        assert.match(fm.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
        assert.ok(fm.name.length <= 64);
        assert.ok(fm.description.length >= 200 && fm.description.length <= 1024, `${s}: description is ${fm.description.length} characters`);
        assert.match(fm.description, /\bUse (it )?when\b/, `${s}: the description must say when to trigger`);
        assert.ok(!/[<>]/.test(fm.description), 'no markup in a description');
        assert.ok(text.split('\n').length <= 260, `${s}/SKILL.md is ${text.split('\n').length} lines: keep it short and put detail in references/`);
        assert.doesNotMatch(text, /\{\{/, 'an unfilled placeholder');
    }
});

test('SKILL.md names every reference file, and every reference it names exists', () => {
    for (const s of SKILL_NAMES) {
        const skill = gen.get(`${s}/SKILL.md`);
        const refs = [...gen.keys()].filter(f => f.startsWith(`${s}/references/`)).map(f => f.split('/').pop());
        for (const r of refs) assert.ok(skill.includes(`references/${r}`), `${s}/SKILL.md does not mention ${r}`);
        for (const m of skill.matchAll(/references\/([\w-]+\.md)/g)) assert.ok(refs.includes(m[1]), `${s}/SKILL.md names ${m[1]}, which does not exist`);
    }
});

test('no personal paths or real email addresses in any file', () => {
    for (const [f, text] of gen) {
        assert.doesNotMatch(text, /[A-Za-z]:[\\/]{1,4}Users[\\/]{1,4}[A-Za-z]|\/Users\/[a-z][\w.-]*\/|\/home\/[a-z][\w.-]*\//, `${f} names a personal path`);
        for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) assert.match(m[0], /@(example\.(com|org|net)|localhost|plainkit\.invalid)$|^(name|user|you|me|hello|info|test)@/i, `${f}: ${m[0]}`);
    }
});

test('the SRI manifest lists every skill file with its size and hash', () => {
    const manifest = JSON.parse(read(path.join(dist, 'manifest.json')));
    const listed = new Map(manifest.files.map(f => [f.path, f]));
    for (const [f, text] of gen) {
        const e = listed.get(`skills/${f}`);
        assert.ok(e, `skills/${f} is not in dist/manifest.json: run node scripts/build-skills.mjs`);
        const bytes = Buffer.from(crlf(text));
        assert.equal(e.bytes, bytes.length);
        assert.equal(e.integrity, 'sha384-' + crypto.createHash('sha384').update(bytes).digest('base64'));
    }
    assert.equal([...listed.keys()].filter(p => p.startsWith('skills/')).length, gen.size);
});

test('the package copy of dist carries the skills as static web assets (wwwroot), not as project content', () => {
    const csproj = read(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'PlainKit.Blazor.csproj'));
    assert.doesNotMatch(csproj, /skills/i);
    assert.doesNotMatch(csproj, /<Content Include/);
    const copy = path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot', 'plainkit', 'skills');
    assert.deepEqual([...diskFiles(copy).keys()].sort(), [...gen.keys()].sort(), 'run node scripts/bootstrap.mjs');
});

test('node scripts/build-skills.mjs --check passes on a current bundle', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-skills.mjs'), '--check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
});

// ---------------------------------------------------------------- coverage

test('every element in api.json has a section in exactly one elements file, and is listed in the index', () => {
    const index = gen.get('plainkit-sdk/references/elements-index.md');
    for (const e of src.api) {
        assert.ok(index.includes(`\`${e.tag}\``), `${e.tag} is missing from the index`);
        const files = [...gen].filter(([f, t]) => /references\/elements-(?!index)/.test(f) && t.includes(`\n## \`${e.tag}\`\n`));
        assert.equal(files.length, 1, `${e.tag} must be documented once`);
        assert.ok(files[0][0].includes(`elements-${groupSlug(e.group)}.md`));
        const section = files[0][1].split(`\n## \`${e.tag}\`\n`)[1].split('\n## `')[0];
        for (const p of e.props) assert.ok(section.includes(`\`${kebab(p.name)}\``), `${e.tag} prop ${p.name}`);
        for (const s of e.slots) assert.ok(section.includes(s.name ? `\`${s.name}\`` : '(default)'), `${e.tag} slot ${s.name}`);
        for (const v of e.events) assert.ok(section.includes(`\`${v.name}\``), `${e.tag} event ${v.name}`);
        for (const v of e.parts) assert.ok(section.includes(`\`${v.name}\``), `${e.tag} part ${v.name}`);
        for (const v of e.cssProperties) assert.ok(section.includes(`\`${v.name}\``), `${e.tag} css property ${v.name}`);
        for (const v of e.methods) assert.ok(section.includes(v.name.replace(/\|/g, '\\|')), `${e.tag} method ${v.name}`);
        for (const v of e.examples) {
            if (EXAMPLE_ISSUES.some(i => i.tag === e.tag && i.title === v.title)) assert.ok(section.includes(`Example "${v.title}" is left out`), `${e.tag} example ${v.title}`);
            else assert.ok(section.includes(v.html.trim().split('\n')[0]), `${e.tag} example ${v.title}`);
        }
    }
    for (const g of new Set(src.api.map(e => e.group))) assert.ok(groupSlug(g), g);
    assert.ok(Object.keys(GROUP_FILES).every(g => src.api.some(e => e.group === g)), 'GROUP_FILES names a group that no element has any more');
});

test('every element has a Blazor entry, and every generated and hand-written component is documented with all its parameters', () => {
    const all = [...gen].filter(([f]) => f.startsWith('plainkit-blazor/references/')).map(([, t]) => t).join('\n');
    for (const e of src.api) assert.ok(all.includes(`\n## \`${pkName(e.tag)}\`\n`), `${pkName(e.tag)} has no section`);
    const skipped = new Set(src.manifest.skipped.filter(s => !s.handWritten).map(s => s.component));
    for (const [name, c] of Object.entries(src.razor)) {
        if (name === 'PkDevToolsPage' || /^Pk(Styles)$/.test(name) && !c.params.length) { assert.ok(all.includes(`## \`${name}\``), name); continue; }
        assert.ok(!skipped.has(name), `${name} is both a component and in the skipped list`);
        assert.ok(all.includes(`\n## \`${name}\``), `${name} is not documented`);
        for (const p of c.params) assert.ok(all.includes(`\`${p.name}\``), `${name}.${p.name}`);
    }
    for (const s of skipped) assert.match(all, new RegExp(`## \`${s}\`\\n[\\s\\S]*?Not available as a component`), `${s} must say it does not exist`);
});

test('every enum, event-args class and option of the Blazor package is in a reference', () => {
    const enums = gen.get('plainkit-blazor/references/enums.md');
    for (const e of [...src.manifest.enums, ...src.enums]) { assert.ok(enums.includes(`\`${e.name}\``), e.name); for (const m of e.members) assert.ok(enums.includes(`\`${m}\``), `${e.name}.${m}`); }
    const events = gen.get('plainkit-blazor/references/events.md');
    assert.ok(src.events.length > 20);
    for (const x of src.events) assert.ok(events.includes(`\`${x.name}\``), x.name);
    const setup = gen.get('plainkit-blazor/references/setup-and-options.md');
    for (const m of [...src.cs.options, ...src.cs.logging, ...src.cs.ipklog]) assert.ok(setup.includes(m.decl), m.decl);
    assert.ok(src.cs.options.length >= 5 && src.cs.logging.length >= 7 && src.cs.ipklog.length === 3);
});

test('the Blazor skill states the alpha status from the manifest: WebAssembly, missing components, the wrapper-only parameters', () => {
    const skill = gen.get('plainkit-blazor/SKILL.md');
    const gaps = gen.get('plainkit-blazor/references/known-gaps.md');
    assert.match(skill, /Blazor Server is verified\. Blazor WebAssembly is not/);
    // PkTable is hand-written now (the last element without a component), and so is PkDataList, which has no element at all.
    assert.ok(src.manifest.skipped.some(s => s.component === 'PkTable' && s.handWritten), 'PkTable is hand-written');
    assert.ok(src.manifest.skipped.every(s => s.handWritten), 'every element has a component');
    for (const c of ['PkTable', 'PkDataList']) assert.ok(skill.includes(`\`${c}\``), c);
    assert.match(gaps, /None: every element has a component/);
    // PkCard, PkEmptyState, PkFieldList and PkStat are hand-written now, so they are not in the "does not exist" list.
    for (const c of ['PkCard', 'PkEmptyState', 'PkFieldList', 'PkStat']) assert.ok(src.manifest.skipped.some(s => s.component === c && s.handWritten), `${c} is hand-written`);
    const wrapper = src.manifest.notGenerated.filter(n => n.reason.startsWith('wrapper behaviour'));
    assert.match(skill, new RegExp(String.raw`\b${wrapper.length} wrapper-only parameters\b`));
    for (const n of wrapper) assert.ok(gaps.includes(`\`${n.param}\``), n.param);
    for (const t of src.manifest.typesToDefine) assert.ok(gaps.includes(`\`${t.param}\``), t.param);
    // The parameters the SKILL.md names as missing are the ones the manifest lists as not generated.
    const missingParams = new Set([...src.manifest.notGenerated, ...src.manifest.typesToDefine].map(n => `${n.component}.${n.param}`));
    for (const m of skill.matchAll(/`(Pk[A-Z]\w*\.[A-Z]\w*)`/g)) assert.ok(missingParams.has(m[1]), `${m[1]} is named as missing but the manifest does not list it`);
    for (const term of ['IPkLog', 'AddPlainKit', 'AddPlainKitDevTools', 'PkOptions', '/_plainkit', 'ForwardToILogger']) assert.ok(skill.includes(term) || gen.get('plainkit-blazor/references/setup-and-options.md').includes(term), term);
});

test('the SDK skill covers templates, patterns, layouts, tools, logging, openers, theming and loading from their sources', () => {
    const f = n => gen.get(`plainkit-sdk/references/${n}.md`);
    for (const t of src.samples.templates) assert.ok(f('templates').includes(`## ${t.id}: `), t.id);
    for (const t of src.samples.patterns) assert.ok(f('patterns').includes(`## ${t.id}: `), t.id);
    // A pattern can ship a script: the reference says so and shows its source, with the imports as an app has them.
    const scripted = src.samples.patterns.filter(t => t.script);
    assert.ok(scripted.length >= 6, 'the patterns that need behaviour have scripts');
    assert.ok(f('patterns').includes('also ships a script'), 'the patterns reference says a pattern can have a script');
    for (const t of scripted) { assert.ok(t.scriptSource.includes('export default function mount(root)'), t.id); assert.ok(f('patterns').includes(t.scriptSource), `${t.id}: its script is shown`); assert.ok(!f('patterns').includes('../../../js/'), 'script imports are rewritten to ./plainkit/js/'); }
    for (const t of src.samples.layouts) assert.ok(f('layouts').includes(`## ${t.id}: `), t.id);
    for (const m of src.modules) { assert.ok(m.mount, `${m.name} has no mount function`); assert.ok(f('tools').includes(`\`${m.mount}\``), m.name); assert.ok(f('tools').includes(m.header.split('\n')[0]), `${m.name} header`); }
    for (const n of src.logExports) assert.ok(f('logging').includes(`\`${n}\``), n);
    for (const term of ['?pk-log=', 'data-pk-log', 'PkLog', 'registerLogOutput', 'warn']) assert.ok(f('logging').includes(term), term);
    for (const term of ['data-open', 'data-toggle', 'data-close']) assert.ok(f('openers').includes(term), term);
    for (const term of ['data-theme', 'data-density', '--color-accent', '--space-4']) assert.ok(f('theming').includes(term), term);
    for (const term of ['initPlainkit', 'observeElements', 'loadElements', 'manifest.json', 'plainkit-dist']) assert.ok(f('loading').toLowerCase().includes(term.toLowerCase()), term);
    for (const n of src.entryExports) assert.ok(f('loading').includes(`\`${n}\``), n);
    for (const t of src.tokens.dark ? Object.keys(src.tokens.dark).filter(n => /^--(color|space|radius)-/.test(n)) : []) assert.ok(f('theming').includes(`\`${t}\``), t);
});

test('no skill advertises a CDN link by git tag (the tag does not carry dist); pinned versions are the release zip and the NuGet package', () => {
    for (const [f, text] of gen) assert.doesNotMatch(text, /jsdelivr/i, `${f} mentions jsDelivr`);
    assert.match(gen.get('plainkit-sdk/references/loading.md'), /GitHub release zip/);
});

// ---------------------------------------------------------------- the code samples

test('every SDK html sample (workflows, examples, templates, patterns, layouts) is real: balanced, real pk-* tags, props, slots and values', () => {
    let checked = 0;
    const bad = [];
    for (const [f, text] of gen) {
        for (const { text: html } of fencesOf(text, ['html'])) { checked++; const p = checkHtml(html); if (p.length) bad.push(`${f}: ${p.join('; ')}\n    ${html.slice(0, 120).replace(/\n/g, ' ')}`); }
    }
    assert.deepEqual(bad, []);
    assert.ok(checked > 100, `only ${checked} samples were checked`);
});

test('every JavaScript sample parses and imports only real exports, with real mount options', () => {
    let checked = 0;
    for (const [f, text] of gen) for (const { text: js } of fencesOf(text, ['js'])) { checked++; assert.deepEqual(checkJs(js), [], `${f}:\n${js.slice(0, 200)}`); }
    assert.ok(checked >= 6);
});

test('every CSS sample uses only real tokens or element custom properties', () => {
    const known = new Set([...Object.keys(src.tokens.dark), ...Object.keys(src.tokens.light), ...Object.keys(src.tokens.root), ...src.api.flatMap(e => e.cssProperties.map(c => c.name))]);
    let checked = 0;
    for (const [f, text] of gen) for (const { text: css } of fencesOf(text, ['css'])) { checked++; for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) assert.ok(known.has(m[1]), `${f}: ${m[1]} is not a token`); }
    assert.ok(checked >= 1);
});

test('every Razor and C# sample uses only real Pk* components, parameters, enums, options and methods', () => {
    let razor = 0, cs = 0;
    for (const [f, text] of filesOf('plainkit-blazor')) {
        for (const { lang, text: code } of fencesOf(text, ['razor', 'csharp'])) {
            if (lang === 'razor') { razor++; assert.deepEqual(checkRazor(code), [], `${f}:\n${code.slice(0, 200)}`); } else cs++;
            assert.deepEqual(checkCode(code), [], `${f}:\n${code.slice(0, 200)}`);
        }
    }
    assert.ok(razor >= 4 && cs >= 2);
});

test('the Blazor references name only Pk* types that exist (or are elements without a component yet)', () => {
    const pkNameSet = new Set(src.api.map(e => pkName(e.tag)));
    for (const [f, text] of filesOf('plainkit-blazor')) for (const m of text.matchAll(/`(Pk[A-Z]\w*)`/g)) assert.ok(knownTypes.has(m[1]) || pkNameSet.has(m[1]) || m[1] === 'PkLog', `${f}: ${m[1]}`);
});

test('an example left out of the references is still wrong in its source (remove the entry when the source is fixed)', () => {
    // The pk-table examples that were wrong (empty-text, expandable and detail slots; issue #39) are fixed: they are checked and published now.
    for (const title of ['Empty and loading', 'Expandable rows']) {
        const ex = byTag.get('pk-table').examples.find(x => x.title === title);
        assert.ok(ex, `pk-table example "${title}" exists`);
        assert.deepEqual(checkHtml(ex.html), [], `pk-table example "${title}" is valid`);
        assert.ok(!EXAMPLE_ISSUES.some(i => i.tag === 'pk-table' && i.title === title), `${title} is not left out`);
        assert.ok([...gen.values()].some(t => t.includes(ex.html.trim().split('\n')[0])), `${title} is in the references`);
    }

    for (const i of EXAMPLE_ISSUES) {
        const ex = byTag.get(i.tag)?.examples.find(x => x.title === i.title);
        assert.ok(ex, `${i.tag} "${i.title}" no longer exists: remove it from EXAMPLE_ISSUES`);
        assert.ok(checkHtml(ex.html).length > 0, `${i.tag} "${i.title}" is valid now: remove it from EXAMPLE_ISSUES`);
    }
});

// ---------------------------------------------------------------- the checkers catch mistakes

test('the checkers reject invented tags, props, slots, values, components and members', () => {
    assert.ok(checkHtml('<pk-nope></pk-nope>').some(p => /unknown element/.test(p)));
    assert.ok(checkHtml('<pk-button colour="red">x</pk-button>').some(p => /no prop "colour"/.test(p)));
    assert.ok(checkHtml('<pk-button variant="huge">x</pk-button>').some(p => /not one of/.test(p)));
    assert.ok(checkHtml('<pk-button style="x">x</pk-button>').some(p => /style/.test(p)));
    assert.ok(checkHtml('<pk-dialog><pk-button slot="sidebar">x</pk-button></pk-dialog>').some(p => /no slot "sidebar"/.test(p)));
    assert.ok(checkHtml('<pk-card><span></pk-card>').some(p => /not closed/.test(p)));
    assert.deepEqual(checkHtml('<pk-dialog heading="x"><pk-button slot="footer" data-close>Ok</pk-button></pk-dialog>'), []);
    assert.deepEqual(checkHtml("<pk-table columns='[{\"key\":\"a\"}]' rows='[]'><a slot=\"cell-1-a\" href=\"#\">x</a></pk-table>"), []);
    assert.ok(checkRazor('<PkNope />').some(p => /unknown component/.test(p)));
    assert.ok(checkRazor('<PkButton class="x">a</PkButton>').some(p => /no parameter "class"/.test(p)));
    assert.ok(checkRazor('<PkButton Variant="ButtonVariant.Huge">a</PkButton>').some(p => /not a member/.test(p)));
    assert.ok(checkRazor('<PkButton @bind-Pressed="p">a</PkButton>').every(p => !/no parameter/.test(p)));
    assert.ok(checkRazor('<PkDialog><Body>x</Body></PkDialog>').some(p => /no fragment "Body"/.test(p)));
    assert.deepEqual(checkRazor('<PkDialog @bind-IsOpen="o"><ChildContent>x</ChildContent></PkDialog>'), []);
    assert.ok(checkRazor('<pk-card colour="x"></pk-card>').some(p => /no prop/.test(p)));
    assert.ok(checkCode('o.Logging.Nope = 1;').some(p => /no Nope/.test(p)));
    assert.ok(checkCode('var x = PkLogLevel.Loud;').some(p => /not an enum member/.test(p)));
    assert.ok(checkCode('var x = new PkWidget();').some(p => /unknown type/.test(p)));
    assert.ok(checkJs("import { nope } from './plainkit/js/log.js';").some(p => /does not export nope/.test(p)));
    assert.ok(checkJs("const x = ;").some(p => /does not parse/.test(p)));
    assert.ok(checkJs("import Toast from '../../../elements/toast-stack/toast-stack.element.js';").some(p => /not from/.test(p)));
    assert.deepEqual(checkJs("import Toast from './plainkit/elements/toast-stack.js';"), []);
    assert.ok(checkJs("await mountDevTools(null, { flavour: 'x' });").some(p => /no option flavour/.test(p)));
});

test('the parsers read the C# and JavaScript sources', () => {
    assert.deepEqual(razorParams('/// <summary>The x.</summary>\n[Parameter] public string? Name { get; set; }\n[Parameter] public int N { get; set; } = 3;\n'), [{ name: 'Name', type: 'string?', default: null, doc: 'The x.' }, { name: 'N', type: 'int', default: '3', doc: '' }]);
    assert.deepEqual(csEnums('public enum A\n{\n    /// <summary>x</summary>\n    One,\n    Two,\n}\n'), [{ name: 'A', members: ['One', 'Two'] }]);
    assert.equal(csMembers('public sealed class C\n{\n    /// <summary>Does <c>x</c>.</summary>\n    public int X { get; set; }\n}\n', 'C')[0].doc, 'Does `x`.');
    assert.equal(headerComment('// one\n// two\ncode();\n// no'), 'one\ntwo');
    assert.ok(csEventArgs(read(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'Generated', 'PkGeneratedEvents.cs'))).length > 20);
});

test('razorParams reads every [Parameter], including one whose doc has a remarks line, and never hands its text to the next', () => {
    const src = [
        '    /// <summary>Hide it.</summary>',
        '    /// <remarks>False hides it.</remarks>',
        '    [Parameter] public bool Show { get; set; } = true;',
        '',
        '    /// <summary>Card width.</summary>',
        '    [Parameter] public int Width { get; set; } = 0;',
        '',
        '    [Parameter] public string? Bare { get; set; }',
    ].join('\n');
    assert.deepEqual(razorParams(src).map(p => [p.name, p.doc]), [['Show', 'Hide it. False hides it.'], ['Width', 'Card width.'], ['Bare', '']]);
    // and against the real components: no [Parameter] goes missing from the parsed list
    const dir = path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'Generated');
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.razor'))) {
        const text = read(path.join(dir, f));
        assert.equal(razorParams(text).length, (text.match(/\[Parameter[\]( ]/g) ?? []).length, `${f}: every [Parameter] is parsed`);
    }
});


// ---------------------------------------------------------------- the table, the list and the raw events (issues #49, #50)

test('the Blazor skill documents PkDataList with every parameter, the request and result records and the table and list workflows', () => {
    const list = gen.get('plainkit-blazor/references/data-list.md');
    assert.ok(list, 'references/data-list.md exists');
    for (const p of src.razor.PkDataList.params) assert.ok(list.includes(`\`${p.name}\``), `PkDataList.${p.name}`);
    for (const t of ['PkListRequest', 'PkListResult', 'CancellationToken', 'Skip', 'ReloadAsync', 'PkTableColumn<TItem>']) assert.ok(list.includes(t), t);
    for (const p of ['Search', 'SortKey', 'Descending', 'Page', 'PageSize', 'Items', 'Total']) assert.ok(list.includes(p), p);
    const skill = gen.get('plainkit-blazor/SKILL.md');
    assert.ok(skill.includes('references/data-list.md'), 'the skill points to the list reference');
    for (const h of ['### Show a table of typed rows', '### Show a searchable, server-paged list']) assert.ok(skill.includes(h), h);
    // PkTable's own section lists its parameters, including the ones for the newer element features
    const components = [...gen].filter(([f]) => f.includes('references/components-')).map(([, t]) => t).join('\n');
    for (const p of ['EmptyText', 'Loading', 'Expandable', 'Expanded', 'DetailTemplate', 'OnRowExpand', 'OnSort', 'OnFilter', 'OnRowClick', 'Manual', 'IdOf']) assert.ok(components.includes(`\`${p}\``), `PkTable.${p}`);
});

test('the skills say raw @onpk-... handlers work for every element and name the EventHandlers class', () => {
    const events = gen.get('plainkit-blazor/references/events.md');
    assert.match(events, /Every\*\* `pk-\*` event of every element is registered/);
    assert.ok(events.includes('@onpk-sort'), 'events.md shows the raw table event');
    for (const n of ['pk-sort', 'pk-filter', 'pk-row-click', 'pk-row-expand']) assert.ok(events.includes(`\`${n}\``), n);
    assert.match(gen.get('plainkit-blazor/SKILL.md'), /@onpk-sort="OnSort"/);
});
