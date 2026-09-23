// Builds the agent skills bundle for developer agents that build their own apps on Plainkit: core/dist/skills/<skill>/ with a thin SKILL.md
// (the Claude Code wrapper: valid frontmatter, short workflows) and references/*.md (plain, format-neutral markdown, so other agent formats can
// be exported from the same files later, issue #36). Node only, no dependencies.
//
//   node scripts/build-skills.mjs           write core/dist/skills/ and refresh dist/manifest.json (the SRI manifest lists the skills)
//   node scripts/build-skills.mjs --check   change nothing; exit 1 when the skills on disk are stale (CI)
//
// Order: node core/tools/build.mjs, node scripts/generate-blazor.mjs, node scripts/build-skills.mjs, node scripts/publish-dist.mjs. The build
// keeps whatever is under dist/skills in the manifest, so it stays independent of this script; this script rebuilds the manifest after writing.
//
// Everything in a skill is generated from a source of truth, nothing is invented: core/dist/elements/api.json (elements), blazor/mappings and
// Generated/generated.manifest.json plus the C# sources (Blazor), the sample folders (templates, patterns, layouts), the header comments of the tool
// modules and of js/log.js and js/invokers.js, tokens/tokens.css, PUBLISHING.md and the rules in STANDARDS.md. The only hand-written parts are the
// short workflows in scripts/skills/<skill>/SKILL.md, and scripts/tests/skills.test.mjs verifies every code sample in them and in the references.
// The version comes from core/VERSION and is stamped into every file, so a version bump regenerates the bundle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pkName, kebab } from './generate-blazor.mjs';
import { loadSamples, build } from '../core/tools/build.mjs';
import { MODULES } from '../core/tools/modules-dist.mjs';
import { parseTokenBlocks } from '../core/js/theme.js';
import { loadBreakpoints } from '../core/tools/breakpoints.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..');
const core = path.join(root, 'core');
const pkg = path.join(root, 'blazor', 'src', 'PlainKit.Blazor');
export const SKILLS_DIR = path.join(core, 'dist', 'skills');
export const SKILL_NAMES = ['plainkit-sdk', 'plainkit-blazor'];
const GENERATOR = 'scripts/build-skills.mjs';

const lf = s => s.replace(/\r\n/g, '\n');
const read = f => lf(fs.readFileSync(f, 'utf8'));
const readJson = f => JSON.parse(read(f));
export const crlf = s => s.replace(/\r?\n/g, '\r\n');
const list = (dir, test = () => true) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(test).sort() : []);

// ---------------------------------------------------------------- markdown helpers

const cell = s => String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const code = s => '`' + String(s).replace(/`/g, "'") + '`';
const fence = (lang, text) => '```' + lang + '\n' + String(text).replace(/\n+$/, '') + '\n```';
function table(head, rows) {
    if (!rows.length) return '';
    return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}
const firstSentence = (s, max = 170) => { const t = String(s).replace(/\s+/g, ' ').trim(); const m = /^(.+?[.!?])(\s|$)/.exec(t); const x = m ? m[1] : t; return x.length > max ? x.slice(0, max - 1).trimEnd() + '…' : x; };
const showValue = v => (v === null ? 'null' : typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v));

// ---------------------------------------------------------------- sources

/** The element groups the API uses, folded into a few reference files (a new group not listed here gets a file of its own). */
export const GROUP_FILES = {
    'Form controls': 'form-controls', 'Forms & inputs': 'form-controls', 'Forms': 'form-controls', 'Form layout': 'form-layout',
    'Layout': 'layout', 'Layout & structure': 'layout', 'Containers': 'layout',
    'Feedback': 'feedback', 'Feedback & status': 'feedback',
    'Data display': 'data-display', 'Media': 'data-display', 'Code': 'data-display',
    'Navigation': 'navigation', 'Actions': 'actions', 'Overlays': 'overlays',
};
export const groupSlug = g => GROUP_FILES[g] ?? g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const GROUP_TITLES = { 'form-controls': 'Form controls', 'form-layout': 'Form layout', layout: 'Layout, structure and containers', feedback: 'Feedback and status', 'data-display': 'Data display, media and code', navigation: 'Navigation', actions: 'Actions', overlays: 'Overlays' };
const groupTitle = slug => GROUP_TITLES[slug] ?? slug;

const DOC_TAGS = /<\/?(summary|para|code|inheritdoc|remarks)\b[^>]*>/g;
const docCode = s => s.replace(/<see cref="([^"]+)"\s*\/>/g, (_, c) => c.replace(/^[A-Z]:/, '').replace(/^.*\./, '')).replace(/<paramref name="([^"]+)"\s*\/>/g, '$1').replace(/<c>(.*?)<\/c>/g, '`$1`');
const cleanDoc = s => docCode(docCode(lf(String(s))).replace(DOC_TAGS, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).replace(/\s*\n\s*(\/\/\/)?\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** Members of a C# type: the doc comment and the declaration line, from the text. */
export function csMembers(text, typeName) {
    const lines = lf(text).split('\n');
    const start = lines.findIndex(l => new RegExp(`^\\s*public\\b.*\\b(class|record|interface|enum|struct)\\s+${typeName}\\b`).test(l));
    if (start < 0) return [];
    let depth = 0, begun = false, doc = [];
    const out = [];
    for (let i = start; i < lines.length; i++) {
        const l = lines[i];
        const inside = begun && depth === 1;
        if (inside) {
            const t = l.trim();
            if (t.startsWith('///')) doc.push(t.replace(/^\/\/\/\s?/, ''));
            else if (t && !t.startsWith('[') && !t.startsWith('//')) {
                if (doc.length && !/inheritdoc/.test(doc.join('')) && !/^(internal|private|protected)\b/.test(t) && (/^public\b/.test(t) || /^[A-Za-z_][\w<>?,\s\[\]]*\s\w+\(.*\);$/.test(t) || /^[A-Z]\w*,?$/.test(t))) {
                    const m = /^(.+?)\s*(\{|=>|;|$)/.exec(t.replace(/\)\s*=>.*$/, ')'));
                    out.push({ decl: (m ? m[1] : t).replace(/[,;]$/, '').trim(), doc: cleanDoc(doc.join('\n').replace(/<\/?summary>/g, '')) });
                }
                doc = [];
            }
        }
        for (const ch of l) { if (ch === '{') { depth++; begun = true; } else if (ch === '}') depth--; }
        if (begun && depth === 0) break;
    }
    return out;
}

/** The [Parameter] members of a Razor component: { name, type, default, doc }. */
export function razorParams(text) {
    const src = lf(text);
    const out = [];
    // A parameter's doc is its <summary>, then an optional <remarks> line. A summary may not run past its own closing tag, or it swallows the
    // parameter before it (a parameter with a <remarks> line used to vanish and hand its text to the next one).
    const re = /(?:\/\/\/ <summary>((?:(?!<\/summary>)[\s\S])*)<\/summary>\s*\n(?:\s*\/\/\/ <remarks>((?:(?!<\/remarks>)[\s\S])*)<\/remarks>\s*\n)?\s*)?\[Parameter[^\]]*\]\s*public\s+(.+?)\s+(\w+)\s*\{\s*get;\s*set;\s*\}(?:\s*=\s*([^;]+);)?/g;
    for (const m of src.matchAll(re)) out.push({ name: m[4], type: m[3].trim(), default: m[5]?.trim() ?? null, doc: [m[1], m[2]].filter(Boolean).map(cleanDoc).join(' ') });
    return out;
}

/** The public enums of a C# file: { name, members[] }. */
export function csEnums(text) {
    const out = [];
    for (const m of lf(text).matchAll(/public enum (\w+)\s*\{([\s\S]*?)\n\}/g)) {
        out.push({ name: m[1], members: [...m[2].matchAll(/^\s*([A-Z]\w*),?\s*$/gm)].map(x => x[1]) });
    }
    return out;
}

/** The event-args classes of Generated/PkGeneratedEvents.cs: { name, event, raisedBy[], fields[{ name, type, doc }] }. */
export function csEventArgs(text) {
    const out = [];
    for (const m of lf(text).matchAll(/\/\/\/ <summary>The detail of <c>([\w-]+)<\/c>, raised by ([^.]*)\.[^\n]*\n(?:public class|public sealed class) (\w+) : EventArgs\s*\{([\s\S]*?)\n\}/g)) {
        const fields = [...m[4].matchAll(/\/\/\/ <summary>The <c>([^<]+)<\/c> field of the detail \(<c>([^<]+)<\/c>\)[^\n]*\n\s*public ([^\n]+?) (\w+) \{/g)].map(f => ({ name: f[4], key: f[1], type: f[3], json: f[2] }));
        out.push({ name: m[3], event: m[1], raisedBy: m[2].split(',').map(s => s.trim()).filter(Boolean), fields });
    }
    return out;
}

/** The header comment of a JavaScript file: the leading `//` lines, without the slashes. */
export function headerComment(text) {
    const out = [];
    for (const l of lf(text).split('\n')) { if (!l.startsWith('//')) break; out.push(l.replace(/^\/\/ ?/, '')); }
    return out.join('\n').trimEnd();
}

/** The names a module file exports, following `export * from './x.js'`. */
export function exportsOf(file, seen = new Set()) {
    if (seen.has(file) || !fs.existsSync(file)) return [];
    seen.add(file);
    const text = read(file);
    const names = new Set();
    for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/gm)) names.add(m[1]);
    for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const n of m[1].split(',')) { const x = n.trim().split(/\s+as\s+/).pop(); if (x) names.add(x); }
    for (const m of text.matchAll(/^export\s+\*\s+from\s+'([^']+)'/gm)) for (const n of exportsOf(path.resolve(path.dirname(file), m[1]), seen)) names.add(n);
    return [...names].sort();
}

/** A `## heading` section of a markdown file: its body without the heading. */
export function section(text, heading) {
    const lines = lf(text).split('\n');
    const i = lines.findIndex(l => l.trim() === `## ${heading}`);
    if (i < 0) return '';
    const j = lines.findIndex((l, k) => k > i && /^## /.test(l));
    return lines.slice(i + 1, j < 0 ? undefined : j).join('\n').trim();
}

export function collect() {
    const version = read(path.join(core, 'VERSION')).trim();
    const apiFile = path.join(core, 'dist', 'elements', 'api.json');
    if (!fs.existsSync(apiFile)) throw new Error('core/dist/elements/api.json does not exist: run node core/tools/build.mjs first');
    const api = readJson(apiFile);
    const mappings = Object.fromEntries(list(path.join(root, 'blazor', 'mappings'), f => f.endsWith('.json')).map(f => [f.replace(/\.json$/, ''), readJson(path.join(root, 'blazor', 'mappings', f))]));
    const manifest = readJson(path.join(pkg, 'Generated', 'generated.manifest.json'));
    const razor = {};
    const inherits = {};
    for (const [dir, kind] of [['Generated', 'generated'], ['Components', 'hand-written']]) {
        for (const f of list(path.join(pkg, dir), f => f.endsWith('.razor') && !f.startsWith('_'))) {
            const text = read(path.join(pkg, dir, f));
            const name = f.replace(/\.razor$/, '');
            razor[name] = { kind, params: razorParams(text), typeParams: [...text.matchAll(/^@typeparam (\w+)/gm)].map(m => m[1]), routes: [...text.matchAll(/^@page "([^"]+)"/gm)].map(m => m[1]) };
            const m = text.match(/^@inherits (\w+)/m);
            if (m) inherits[name] = m[1];
        }
    }
    // A component's own params plus, first, the ones it inherits from a plain C# base class in Components/ (for example PkTableBase, the
    // chrome pk-table's data-driven and raw modes share, issue 228): the base has no markup of its own so it is never a razor[] entry,
    // but its [Parameter]s are real API surface and belong in the generated docs.
    for (const [name, baseName] of Object.entries(inherits)) {
        const baseFile = path.join(pkg, 'Components', `${baseName}.cs`);
        if (!fs.existsSync(baseFile)) continue;
        const baseParams = razorParams(read(baseFile));
        if (!baseParams.length) continue;
        const own = new Set(razor[name].params.map(p => p.name));
        razor[name].params = [...baseParams.filter(p => !own.has(p.name)), ...razor[name].params];
    }
    const cs = f => read(path.join(pkg, f));
    const enums = [...csEnums(cs('PkEnums.cs')), ...csEnums(cs('PkLogging.cs'))];
    const dist = f => path.join(core, 'dist', f);
    const modules = Object.keys(MODULES).map(name => {
        const file = dist(`modules/${name}/${name}.js`);
        const text = read(file);
        return { name, header: headerComment(text), mount: /^export\s+async\s+function\s+(mount\w+)/m.exec(text)?.[1] ?? null };
    });
    const gallery = { name: 'gallery', header: headerComment(read(dist('gallery/gallery.js'))), mount: /^export\s+(?:async\s+)?function\s+(mount\w+)/m.exec(read(dist('gallery/gallery.js')))?.[1] ?? null };
    const samples = loadSamples();
    const templates = samples.templates.map(t => {
        const dir = path.join(core, 'samples', 'templates', t.id);
        const page = read(path.join(dir, `${t.id}.html`));
        // The page content: the body without the script tags, and without the <main id="content"> wrapper the demo shell fills.
        const body = (/<body>\n?([\s\S]*?)<\/body>/.exec(page)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, '').trim();
        const main = /^<main id="content">\n?([\s\S]*?)<\/main>$/.exec(body)?.[1].trim() ?? body;
        const jsFile = path.join(dir, `${t.id}.js`);
        // The script imports the SDK modules by their place in the repository (../../../js/, ../../../elements/x/x.element.js); in an app they sit under the copy of dist (./plainkit/js/, ./plainkit/elements/x.js).
        const script = fs.existsSync(jsFile) ? read(jsFile).split('\n').filter(l => !/^import \{ mountChrome \}/.test(l) && !/^mountChrome\(/.test(l)).join('\n').trim().replace(/from '\.\.\/\.\.\/\.\.\/js\//g, "from './plainkit/js/").replace(/from '\.\.\/\.\.\/\.\.\/elements\/([\w-]+)\/\1\.element\.js'/g, "from './plainkit/elements/$1.js'") : '';
        return { ...t, main, script };
    });
    const tokenCss = read(path.join(core, 'tokens', 'tokens.css'));
    return {
        version, api, mappings, manifest, razor, enums,
        events: csEventArgs(read(path.join(pkg, 'Generated', 'PkGeneratedEvents.cs'))),
        cs: { options: csMembers(cs('PkOptions.cs'), 'PkOptions'), logging: csMembers(cs('PkLogging.cs'), 'PkLoggingOptions'), ipklog: csMembers(cs('PkLogging.cs'), 'IPkLog'), scoreTarget: csMembers(cs('PkScoreTarget.cs'), 'PkScoreTarget'), runtime: csMembers(cs('PkRuntime.cs'), 'PkRuntime'), assets: csMembers(cs('PkAssets.cs'), 'PkAssets'), snapshot: csMembers(cs('DevTools/PkSnapshot.cs'), 'PkSnapshot'), listRequest: csMembers(cs('PkListTypes.cs'), 'PkListRequest'), tableColumn: csMembers(cs('PkTableTypes.cs'), 'PkTableColumn'), listTypesText: cs('PkListTypes.cs') },
        modules: [...modules, gallery],
        // A pattern that ships a script: its source, with the SDK import paths as they are in an app (a copy of dist at ./plainkit/).
        samples: { templates, patterns: samples.patterns.map(p => (p.script ? { ...p, scriptSource: read(path.join(core, 'samples', 'patterns', p.script)).replace(/from '(?:\.\.\/){3}js\//g, "from './plainkit/js/").trim() } : p)), layouts: samples.layouts },
        breakpoints: loadBreakpoints(), breakpointReport: readJson(dist('breakpoints.report.json')),
        tokens: parseTokenBlocks(tokenCss), tokenCount: [...tokenCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].length,
        logHeader: headerComment(read(dist('js/log.js'))),
        invokersHeader: headerComment(read(dist('js/invokers.js'))),
        inspectorHeader: headerComment(read(dist('js/element-inspector.js'))),
        entryHeader: headerComment(read(path.join(core, 'js', 'plainkit.js'))),
        entryExports: exportsOf(dist('js/plainkit.js')),
        logExports: exportsOf(dist('js/log.js')),
        loaderExports: exportsOf(dist('js/loader.js')),
        themeExports: exportsOf(dist('js/theme.js')),
        standards: read(path.join(core, 'STANDARDS.md')),
        publishing: read(path.join(root, 'PUBLISHING.md')),
        blazorReadme: read(path.join(pkg, 'README.md')),
    };
}

// ---------------------------------------------------------------- the bundle

const stamp = (src, from) => `> Plainkit ${src.version}. Generated by ${GENERATOR} from ${from}. Do not edit: change the source and run the generator.`;
const stampLine = src => `Plainkit ${src.version}. Generated by ${GENERATOR}; do not edit.`;

const attrName = p => kebab(p.name);
const typeText = p => p.type + (p.type === 'json' ? ' (a JSON attribute, or set the property)' : '');
const detailText = d => (d === null || d === undefined ? 'none' : typeof d === 'string' ? d : '{ ' + Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(', ') + ' }');

/** Examples in the element meta that the samples test proves wrong (a test also fails when one of these becomes valid, so the entry gets removed). */
export const EXAMPLE_ISSUES = [];

function elementSection(e) {
    const out = [`## ${code(e.tag)}`, '', `**${e.title}** (${e.group}). ${e.summary}`];
    const flags = [e.formAssociated && 'form-associated (takes part in a `<form>` by its `name`)', e.delegatesFocus && 'delegates focus to its inner control'].filter(Boolean);
    if (flags.length) out.push('', `It is ${flags.join(' and ')}.`);
    const deprecated = [[e.deprecated, 'the element'], ...[['prop', 'props'], ['event', 'events'], ['slot', 'slots']].flatMap(([k, l]) => e[l].map(x => [x.deprecated, `${k} ${code(x.name || '(default)')}`]))].filter(([d]) => d);
    if (deprecated.length) out.push('', '**Deprecated: do not use in new code** (it logs a warning and is removed in the release shown)', '', table(['What', 'Since', 'Removed in', 'Use instead'], deprecated.map(([d, what]) => [what, d.since, d.remove, d.message])));
    if (e.props.length) out.push('', '**Props** (set as an attribute in kebab-case, or as a property in camelCase; a boolean is present or absent)', '', table(['Attribute', 'Property', 'Type', 'Default', 'Values', 'Description'], e.props.map(p => [code(attrName(p)), code(p.name), typeText(p), code(showValue(p.default)), p.values ? p.values.map(code).join(' ') : '', p.description])));
    else out.push('', '**Props**: none.');
    if (e.slots.length) out.push('', '**Slots** (`slot="name"` on a child)', '', table(['Slot', 'Description'], e.slots.map(s => [s.name ? code(s.name) : '(default)', s.description])));
    if (e.events.length) out.push('', '**Events** (`addEventListener`; `pk-*` events are CustomEvents whose `detail` is shown)', '', table(['Event', 'Detail', 'Description'], e.events.map(v => [code(v.name), code(detailText(v.detail)), v.description])));
    if (e.methods.length) out.push('', '**Methods**', '', table(['Method', 'Description'], e.methods.map(m => [code(m.name), m.description])));
    if (e.parts.length) out.push('', '**CSS parts** (`::part(name)`)', '', table(['Part', 'Description'], e.parts.map(p => [code(p.name), p.description])));
    if (e.cssProperties.length) out.push('', '**CSS custom properties** (set on the element or a parent, from a stylesheet)', '', table(['Property', 'Default', 'Description'], e.cssProperties.map(c => [code(c.name), c.default ? code(c.default) : '', c.description])));
    if (e.writes?.length) out.push('', '**Writes to host nodes** (attributes and props this element sets on nodes it does not own)', '', table(['Target', 'Writes', 'Why'], e.writes.map(w => [w.target, w.attributes.map(code).join(', '), w.why])));
    out.push('', `**Accessibility.** ${e.a11y}`);
    for (const x of e.examples) {
        const issue = EXAMPLE_ISSUES.find(i => i.tag === e.tag && i.title === x.title);
        if (issue) out.push('', `Example "${x.title}" is left out: ${issue.reason}`);
        else out.push('', `Example: ${x.title}`, '', fence('html', x.html));
    }
    return out.join('\n');
}

function sdkElementFiles(src) {
    const bySlug = new Map();
    for (const e of src.api) { const s = groupSlug(e.group); if (!bySlug.has(s)) bySlug.set(s, []); bySlug.get(s).push(e); }
    const files = new Map();
    const index = [];
    for (const [slug, els] of [...bySlug].sort((a, b) => a[0].localeCompare(b[0]))) {
        els.sort((a, b) => a.tag.localeCompare(b.tag));
        const name = `references/elements-${slug}.md`;
        files.set(name, [`# Elements: ${groupTitle(slug)}`, '', stamp(src, 'core/dist/elements/api.json'), '', 'Every element also takes the usual HTML global attributes (`id`, `class`, `slot`, `hidden`, `aria-*`, `data-*`). Never use a `style` attribute (the CSP blocks it): use props, parts and CSS custom properties.', '', els.map(elementSection).join('\n\n')].join('\n') + '\n');
        for (const e of els) index.push({ e, file: name });
    }
    index.sort((a, b) => a.e.tag.localeCompare(b.e.tag));
    files.set('references/elements-index.md', [`# Elements: index`, '', stamp(src, 'core/dist/elements/api.json'), '', `${src.api.length} elements. Open the file named in the last column for a tag's props, slots, events, parts, CSS properties, methods and examples.`, '', table(['Tag', 'Group', 'What it is', 'File'], index.map(({ e, file }) => [code(e.tag), e.group, firstSentence(e.summary), code(file.replace('references/', '')) ])), ''].join('\n'));
    return { files, slugs: [...bySlug.keys()].sort() };
}

function templatesMd(src) {
    const out = ['# Page templates', '', stamp(src, 'core/samples/templates and the element API'), '',
        'Full-page starting points, one folder each in `dist/gallery/templates/<id>/`. The markup below is the page content (the demo pages put it inside `<main id="content">`, or use a `pk-workspace` with that id); the demo pages wrap it in a demo shell (`chrome.js`), which you should not copy: build your own frame from `pk-app-shell` with `pk-side-nav` or `pk-navbar` (see `elements-navigation.md`, and the `overlays-nav` template, which shows one). To start from a template: put its markup in your page, keep the page script if one is shown (it is what the demo runs after the shell; its imports assume `plainkit/` is a copy of `dist` next to your page), and change the text and data.', ''];
    for (const t of src.samples.templates) {
        out.push(`## ${t.id}: ${t.title}`, '', t.summary, '', ...(t.notes ? [t.notes, ''] : []), `Elements used: ${t.used.map(u => code('pk-' + u)).join(' ')}.`, '', fence('html', t.main));
        if (t.script) out.push('', 'Page script:', '', fence('js', t.script));
        out.push('');
    }
    return out.join('\n');
}
function patternsMd(src, kind) {
    const isLayout = kind === 'layouts';
    const list = src.samples[kind];
    const out = [isLayout ? '# Page layouts' : '# Composed patterns', '', stamp(src, isLayout ? 'core/layouts and the element API' : 'core/samples/patterns and the element API'), '',
        isLayout ? 'Page anatomies: the skeleton of a kind of page, as markup. Put the markup inside your page frame and replace the text and data.' : 'Small compositions of elements for a common job (confirming a delete, filtering a table, forms, notifications). The elements bring their behaviour; a pattern whose wiring is not declarative (a toast on demand, an unsaved bar, results that filter, steps that advance, a selection that fills a detail) also ships a script, shown after its markup, that you adapt to your data. Patterns without a script are markup only.', ''];
    for (const t of list) {
        out.push(`## ${t.id}: ${t.title}`, '', t.summary, '');
        if (t.built) out.push(`Built from: ${t.built}`, '');
        if (t.mobile) out.push(`On a phone: ${t.mobile}`, '');
        out.push(`Elements used: ${t.used.map(u => code('pk-' + u)).join(' ')}.`, '', fence('html', t.html));
        if (t.scriptSource) out.push('', 'Script (the gallery runs it after the markup is on the page, in the full-page view and in the inline views alike: `mount(root)` gets the element that holds the markup, works only inside it, and returns `{ destroy() }` (call it when the markup is removed, so its listeners go); its imports assume `plainkit/` is a copy of `dist`):', '', fence('js', t.scriptSource));
        out.push('');
    }
    return out.join('\n');
}

function toolsMd(src) {
    const out = ['# Tool modules', '', stamp(src, 'the header comments of dist/modules/<tool>/<tool>.js'), '',
        'The tools are the modules unit, separate from the runtime: each is a module in `dist/modules/<tool>/<tool>.js` (its own zip, `plainkit-modules-<version>.zip`, and its own manifest, `dist/modules/manifest.json`; the runtime `dist/` holds no tool). Keep the unit at `dist/modules/` next to the runtime, or host it apart and name the runtime once (`<meta name="plainkit-runtime" content="https://host/plainkit/">` plus an import map for the `../../js/*.js` imports; see core/README.md). Each tool has one entry point, `mountX(container, options)`, that returns a handle (with `destroy()` at least). The module adds `plainkit.css` to the document if it is missing and loads the elements it needs, so a page needs no other setup. The text under each heading is the module\'s own documentation, verbatim.',
        '', table(['Tool', 'Import', 'Entry point'], src.modules.map(m => [m.name, code(`dist/modules/${m.name}/${m.name}.js`), m.mount ? code(m.mount) : ''])), ''];
    for (const m of src.modules) out.push(`## ${m.name}`, '', fence('text', m.header), '');
    out.push('## element inspector', '', 'File `dist/js/element-inspector.js`, entry point `createElementInspector(container)`.', '', fence('text', src.inspectorHeader), '');
    out.push('## The code explorer element', '', 'The code explorer is also a custom element, `<pk-code-explorer>`, defined by `dist/modules/code-explorer/element.js` (events `pk-code-explorer-open` and `pk-code-explorer-error`, height hook `--pk-code-explorer-height`). `mountCodeExplorer` creates it for you.', '');
    return out.join('\n');
}

function loggingMd(src) {
    const std = section(src.standards, 'Logging');
    const bullets = std.split('\n').filter(l => l.startsWith('- **')).join('\n');
    return ['# Logging', '', stamp(src, 'dist/js/log.js and STANDARDS.md'), '',
        'The SDK has one logger. Its own messages and yours go through it, so one viewer (the dev tools Logs tab, or `mountLogs`) shows everything. The default level is `warn`, so a production page is quiet. The header of `js/log.js`, verbatim:', '', fence('text', src.logHeader), '',
        '## Exports of `dist/js/log.js`', '', src.logExports.map(code).join(', ') + '.', '',
        '## Scopes and levels', '', bullets, '',
        '## Turn it on', '', 'Without touching code: add `?pk-log=debug` to the address, or `data-pk-log="debug"` on `<html>`. In code:', '',
        fence('js', "import { createLogger, configureLogging } from './plainkit/js/log.js';\n\nconfigureLogging({ level: 'info', scopes: { checkout: 'debug' }, routes: { error: ['console', 'toast'] } });\nconst log = createLogger('checkout');\nlog.info('order placed', { id: 42 });"), '',
        'From the browser console: `PkLog.setLogLevel(\'debug\')`. Settings saved with `configureLogging(settings, { persist: true })` survive a reload; `resetLogging()` forgets them. See `tools.md` for `mountLogs` (the viewer) and `mountLogSettings` (an editor for these settings).', ''].join('\n');
}

function openersMd(src) {
    return ['# Declarative openers', '', stamp(src, 'dist/js/invokers.js'), '',
        'Open, toggle and close a `pk-dialog`, `pk-drawer` or `pk-popover` from markup, with no script. The three elements install the one delegated click listener the first time one connects; `initPlainkit()` installs it too (idempotent). Mistakes (an empty, invalid or unmatched selector, a `data-close` outside an overlay) are logged as warnings by the `invokers` scope. The header of `js/invokers.js`, verbatim:', '', fence('text', src.invokersHeader), '',
        fence('html', '<pk-button data-open="#confirm">Delete</pk-button>\n<pk-dialog id="confirm" heading="Delete this item?" size="sm">\n  <p>This cannot be undone.</p>\n  <pk-button slot="footer" variant="ghost" data-close>Cancel</pk-button>\n  <pk-button slot="footer" variant="warn" data-close>Delete</pk-button>\n</pk-dialog>'), '',
        '`data-close` only hides the dialog; run your own work from the button\'s `click` listener. Exports of `dist/js/invokers.js`: ' + exportsOf(path.join(core, 'dist', 'js', 'invokers.js')).map(code).join(', ') + '.', ''].join('\n');
}

function themingMd(src) {
    const { dark, light, root: shared } = src.tokens;
    const names = [...new Set([...Object.keys(dark), ...Object.keys(light), ...Object.keys(shared)])];
    const groups = [['color', /^--color-/], ['space', /^--space-/], ['text', /^--text-/], ['radius', /^--radius-/], ['shadow', /^--shadow-/], ['font', /^--font-/], ['z-index', /^--z-/]];
    const val = n => (n in dark || n in light ? [dark[n] ?? '', light[n] ?? ''] : [shared[n] ?? '', shared[n] ?? '']);
    const out = ['# Theming and tokens', '', stamp(src, 'core/tokens/tokens.css'), '',
        `Two themes and two densities are token sets, never separate stylesheets: set ${code('data-theme="dark"')} or ${code('data-theme="light"')} (and optionally ${code('data-density="compact"')}) on \`<html>\` or on any element to theme only that subtree. Every colour, size, space and shadow is a CSS custom property (${src.tokenCount} declarations in the token stylesheet); use them, never literal colours. \`dist/js/theme.js\` exports ${src.themeExports.map(code).join(', ')}. To change a token, override it in a stylesheet you load after \`plainkit.css\` (an inline \`style\` attribute is blocked by the CSP; setting properties from script through \`element.style.setProperty\` is fine). \`mountThemeEditor\` (see \`tools.md\`) edits and exports these overrides.`, '',
        fence('css', ':root[data-theme="dark"] {\n    --color-accent: #7c3aed;\n}\n:root[data-theme="light"] {\n    --color-accent: #6d28d9;\n}'), ''];
    for (const [title, re] of groups) {
        const rows = names.filter(n => re.test(n)).map(n => { const [d, l] = val(n); return [code(n), d === l ? code(d) : code(d), d === l ? '(same)' : code(l)]; });
        if (rows.length) out.push(`## ${title} tokens`, '', table(['Token', 'Dark (or shared)', 'Light'], rows), '');
    }
    const used = new Set(groups.flatMap(([, re]) => names.filter(n => re.test(n))));
    const other = names.filter(n => !used.has(n)).sort();
    out.push('## Other tokens', '', 'Element and layout tokens (chart, code viewer, control heights, field states, ...). Names only; the values are in `dist/plainkit.css`.', '', other.map(code).join(' '), '');
    out.push(...breakpointsMd(src));
    return out.join('\n');
}

// The named breakpoints, from tokens/breakpoints.json and the build's analysis (dist/breakpoints.report.json), so the numbers here are the shipped ones.
function breakpointsMd(src) {
    const rows = src.breakpoints.map(b => { const r = src.breakpointReport.byBreakpoint[b.name]; return [code(b.name), `${b.width}px`, code(`(max-width: ${b.width}px)`), code(`(min-width: ${b.width + 1}px)`), code(`--pk-bp-${b.name}`), `${r.elementCount} element${r.elementCount === 1 ? '' : 's'}, ${r.ruleCount} rule${r.ruleCount === 1 ? '' : 's'}`]; });
    return ['## Breakpoints', '',
        'The page and the elements respond at named widths, desktop-first: a rule for a breakpoint applies at that width **and below**. Custom properties cannot be used inside `@media`, so the widths are resolved when the SDK is built (`core/tokens/breakpoints.json`); a prebuilt `dist` has these values, and other widths need a rebuild. The elements already respond on their own: do not restyle them at these widths.', '',
        table(['Name', 'Width', 'At or below', 'Above', 'Custom property', 'What changes there'], rows), '',
        'The SDK\'s own element CSS writes these as `(--phone)` and `(--above-phone)`, which its build resolves; that syntax works only inside the SDK, not in your stylesheet.', '',
        `In **your own** stylesheet write the literal query with the same width (${src.breakpoints.map(b => code(`(max-width: ${b.width}px)`)).join(', ')}); a variable does not work in \`@media\`. In a script read the width from the page, never repeat the number: ${code("import { mediaBelow } from './plainkit/js/breakpoints.js'")} then ${code("mediaBelow('phone').matches")} (also ${code('mediaAbove(name)')}, ${code('breakpoint(name)')} for the number, ${code('belowQuery(name)')} and ${code('aboveQuery(name)')} for the query text). What each breakpoint changes, element by element, is in \`dist/breakpoints.report.json\`.`, ''];
}

function loadingMd(src) {
    // The table from PUBLISHING.md; "below" (a later section of that file) is named.
    const rows = section(src.publishing, 'How people get the SDK').replace('(below)', '(see PUBLISHING.md)');
    return ['# Loading Plainkit', '', stamp(src, 'PUBLISHING.md, dist/js/plainkit.js and dist/js/loader.js'), '',
        `This bundle is for Plainkit ${src.version}. Pinned versions come from the GitHub release zips (\`plainkit-dist-${src.version}.zip\` is the runtime; \`plainkit-modules-${src.version}.zip\` is the dev tools, unzipped into the same folder, so it lands at \`dist/modules/\`) or the NuGet package (both units); the Pages site is the latest \`main\` and is not pinned.`, '',
        '## Ways to get it', '', rows, '',
        '## Wire a page', '', 'Link one stylesheet and start the elements from a script file (an inline script is blocked under a strict CSP). `plainkit/` below is wherever you copied or serve `dist`. Importing the entry module is not enough: `initPlainkit()` must be called (a `<script src="plainkit/plainkit.js">` alone defines no element). `dist/js/init.js` is the small entry, `initPlainkit` alone; `dist/js/plainkit.js` (also reachable as `dist/plainkit.js`) is the same plus the dynamic-value, theming and colour helpers, in case a page uses those too. `modulepreload` links for the loader, its logger, the element registry and the base every element shares let the browser fetch them in parallel instead of one round trip at a time as each is discovered; worth adding on a page that uses `pk-*` elements.', '',
        fence('html', '<link rel="stylesheet" href="plainkit/plainkit.min.css">\n<link rel="modulepreload" href="plainkit/js/loader.js">\n<link rel="modulepreload" href="plainkit/js/log.js">\n<link rel="modulepreload" href="plainkit/elements/registry.js">\n<link rel="modulepreload" href="plainkit/js/element.js">\n<link rel="modulepreload" href="plainkit/js/element-core.js">\n<script type="module" src="app.js"></script>\n<pk-alert kind="info" heading="It works">No framework, no build.</pk-alert>'), '',
        fence('js', "import { initPlainkit } from './plainkit/js/init.js';\ninitPlainkit();"), '',
        'The full entry module `dist/js/plainkit.js` (also reachable as `dist/plainkit.js`), verbatim:', '', fence('text', src.entryHeader), '',
        `Exports of the full entry module: ${src.entryExports.map(code).join(', ')}.`, '',
        '## How elements load', '', `\`initPlainkit(root = document)\` installs the declarative openers, imports the modules of the \`pk-*\` tags found under \`root\` (each element is its own module, \`dist/elements/<name>.js\`, mapped by \`dist/elements/registry.js\`) and watches for tags added later. A tag that is not in the registry (usually a typo) is logged as a warning by the \`loader\` scope and stays inert. Exports of \`dist/js/loader.js\`: ${src.loaderExports.map(code).join(', ')}.`, '',
        '`dist/manifest.json` lists every file of the runtime with its size and SRI hash (`dist/modules/manifest.json` does the same for the modules unit); the SDK makes no runtime request to another origin. Editor support is generated into `dist/`: `custom-elements.json`, `vscode.html-custom-data.json`, `web-types.json`, `elements.d.ts`.', ''].join('\n');
}

const SDK_GAPS = [
    'Class-based components are gone. The old `.btn`, `.card`, `.modal-*`, `.notice`, `.dg-*` and similar CSS classes no longer exist; every component is a `pk-*` element (the page layer, `plainkit.css`, holds tokens, base styles, spacing, typography, table content and utilities).',
    'No inline `style` attributes, `<style>` elements, inline event handlers or inline scripts: the toolkit is built for `script-src \'self\'; style-src \'self\'`. Use props, `::part()` and CSS custom properties from a stylesheet, and scripts from files.',
    'Use only elements that exist (see `elements-index.md`). If a component you need is missing, say so instead of building a one-off; the missing-components list is tracked as an issue in the repository.',
    'The Guides (the Guides page of the site, from Markdown in core/site/guides/content) are a first set of five: getting started with the SDK and with Blazor, theming and tokens, responsive design and breakpoints, logging. The page has a search box (title and full-text, from a build-time word index), but no versions and no HTML/Blazor tabs yet, so the references in this skill remain the full documentation.',
    'The planned reactive layers (templates with expressions, `defineElement`, app islands, single-file components) are not built. Behaviour is plain: props are attributes or properties, events are `addEventListener`, forms and `data-theme` work natively.',
    'The layout builder (`mountLayoutBuilder`, `dist/modules/layout-builder/`) has pointer/touch drag-and-drop for the top-level page order and for a palette element dropped onto the canvas (slot-aware when it lands on a container); reordering inside a container, and moving a node into or out of one, stays keyboard/toolbar-only (Alt+arrows, Out/In). At phone width the toolbar row is hidden entirely: touch drag and a per-element Edit/Delete chip are the whole interaction model there (Ctrl+S still saves with an attached keyboard; there is no on-screen Save once the row is gone). The iframe device preview, reusable blocks and the Blazor `PkLayoutBuilder` wrapper are not built yet.',
    'Sample layouts are markup only. A sample pattern or template that needs behaviour ships a script of its own (a pattern\'s is shown in `patterns.md`, a template\'s in `templates.md`). Their data is placeholder text.',
    '`PkDialog` (`confirm`, `alert`, `prompt`) becomes a global when a `pk-dialog` has connected, and `PkToast` (`show`) when a `pk-toast-stack` has, so the page must contain one before you call them.',
    'Loading `dist/plainkit.js` as a script does not define any element by itself: the page has to call `initPlainkit()` (see `loading.md`).',
];
// Lines of a STANDARDS.md section that are about the toolkit's own development (its scan allow-list, budgets, module folders) are left out.
const appFacing = text => text.split('\n').filter(l => !/security\.allow|budget|module folder|innerHTML/.test(l)).join('\n');
function sdkGapsMd(src) {
    return ['# Known gaps and rules', '', stamp(src, 'CHANGELOG.md, core/README.md, core/STANDARDS.md and the element sources'), '', `Plainkit ${src.version} is a pre-release. Things an agent should not assume:`, '', SDK_GAPS.map(g => `- ${g}`).join('\n'), '',
        '## Rules from the standards', '', appFacing(section(src.standards, 'Security (CSP)')), '', appFacing(section(src.standards, 'Styling')), ''].join('\n');
}

// issue 237: a blast-radius recipe for moving a consuming app from an older Plainkit version to a newer one. `findVersion` is the
// skill-specific step (a NuGet PackageReference for Blazor, dist/manifest.json or js/version.js for the vanilla SDK); the rest of the
// recipe (read the changelog, cross-reference the app, checklist, mechanical vs. judgment) is identical for both.
function upgradingMd(src, findVersion) {
    return ['# Upgrading', '', stamp(src, 'CHANGELOG.md and core/tools/api-surface.mjs'), '',
        `This is a blast-radius recipe, not a changelog readout: the goal is a checklist of what to change in *this app*, not a summary of what Plainkit changed in the abstract.`, '',
        '## 1. Find the two versions', '', findVersion, '',
        '## 2. Pull what changed between them', '',
        `\`CHANGELOG.md\` (${code('https://github.com/skulmunkie/plainkit/blob/main/CHANGELOG.md')}, not shipped in the package) has one section per released version, with \`### Breaking\`, \`### Removed\`, \`### Changed\`, \`### Fixed\`, \`### Added\` and \`### Notes\` subsections; every entry names the affected element, component or export and its issue number. Read every version's section between the installed one and the target, and pull out ${code('Breaking')}/${code('Removed')}/${code('Changed')} entries first (these are the ones that can break a build or change behaviour silently) and ${code('Added')} second (opportunities, not urgent). A running app already surfaces one more signal for free: an element or a Blazor component that is deprecated but not yet removed logs a one-time console/ILogger warning (\`js/deprecation.js\`) naming what to use instead — check the app's own logs, not just the changelog, for anything still on borrowed time.`, '',
        '## 3. Cross-reference against this app\'s own code', '',
        'A changelog entry only matters if the app uses what it names. For every tag, component, parameter, event or slot the step above turned up, search the app itself (not the Plainkit source) for it — grep for the Razor component name or the element tag, the parameter name, the event name. The output of this step is specific: "this app uses `PkTable`\'s `EmptyContent` in 3 files, and the changelog says it was renamed," not "`EmptyContent` was renamed."', '',
        '## 4. Produce a checklist, most severe first', '',
        'Group the matches from step 3 by severity (breaking first), each with the file(s) it appears in — the shape a person or another agent can work through and tick off, not a wall of prose.', '',
        '## 5. Say what is mechanical and what needs a judgment call', '',
        'A renamed parameter or component is a mechanical find-and-replace: make the change yourself. A removed component with no direct replacement, or a behaviour change with no compile-time signal, needs a person to decide: flag it on the checklist instead of guessing.', ''].join('\n');
}

// ---------------------------------------------------------------- Blazor

const componentOfTag = tag => pkName(tag);

function paramSets(mapParam, apiEl) {
    if (!mapParam) return '';
    const kind = mapParam.map ?? (mapParam.prop !== undefined ? 'prop' : mapParam.slot !== undefined ? 'slot' : mapParam.event !== undefined ? 'event' : mapParam.cssProperty !== undefined ? 'cssProperty' : mapParam.text !== undefined ? 'text' : 'wrapper');
    if (kind === 'prop') return `attribute ${code(kebab(mapParam.prop))}`;
    if (kind === 'slot') return mapParam.slot ? `slot ${code(mapParam.slot)}` : 'default slot';
    if (kind === 'event') return `event ${code(mapParam.event)}`;
    if (kind === 'cssProperty') return `CSS property ${code(mapParam.cssProperty)}`;
    if (kind === 'text') return 'text content';
    return '';
}

function componentSection(src, tag, enumMap) {
    const comp = componentOfTag(tag);
    const el = src.api.find(e => e.tag === tag);
    const razor = src.razor[comp];
    const mapping = src.mappings[tag.replace(/^pk-/, '')];
    const out = [`## ${code(comp)}`, '', `${code('<' + tag + '>')}: **${el.title}** (${el.group}). ${el.summary}`, ''];
    if (!razor) {
        out.push(`**Not available as a component in this package.** Use the element directly in markup: ${code('<' + tag + '>')} with its props, slots and events as documented in the \`plainkit-sdk\` skill (\`elements-${groupSlug(el.group)}.md\`). See \`known-gaps.md\`.`);
        return out.join('\n');
    }
    if (razor.kind === 'hand-written') out.push('Hand-written component (not generated).', '');
    const mp = new Map((mapping?.params ?? []).map(p => [p.name, p]));
    const names = new Set(razor.params.map(p => p.name));
    const rows = razor.params.map(p => {
        const base = p.type.replace(/\?$/, '');
        const en = enumMap.get(base);
        const twoWay = p.name.endsWith('Changed') && names.has(p.name.slice(0, -7)) ? `two-way pair of ${code(p.name.slice(0, -7))}` : paramSets(mp.get(p.name), el);
        return [code(p.name), code(p.type), en ? `${en.members.map(code).join(' ')}` : '', twoWay, p.doc];
    });
    out.push('**Parameters**', '', table(['Parameter', 'Type', 'Enum values', 'Sets', 'Description'], rows));
    const binds = razor.params.filter(p => p.name.endsWith('Changed') && names.has(p.name.slice(0, -7))).map(p => code('@bind-' + p.name.slice(0, -7)));
    if (binds.length) out.push('', `Two-way binding: ${binds.join(', ')}.`);
    const named = razor.params.filter(p => /^RenderFragment/.test(p.type) && p.name !== 'ChildContent');
    if (named.length && names.has('ChildContent')) out.push('', `When you set a named fragment (${named.map(f => code(f.name)).join(', ')}), write the body as an explicit ${code('<ChildContent>')} tag too: Razor does not allow an implicit body next to a named fragment.`);
    const events = src.events.filter(x => x.raisedBy.includes(comp));
    if (events.length) out.push('', '**Event args**', '', table(['Event', 'Args class', 'Fields'], events.map(x => [code(x.event), code(x.name), x.fields.map(f => `${f.name}: ${f.type}`).join(', ')])));
    const skipped = src.manifest.notGenerated.filter(n => n.component === comp);
    if (skipped.length) out.push('', '**Not available as parameters** (they do not exist; do not use them)', '', table(['Parameter', 'Why'], skipped.map(n => [code(n.param), n.reason])));
    const todo = src.manifest.typesToDefine.filter(n => n.component === comp);
    if (todo.length) out.push('', '**Type not defined yet**', '', table(['Parameter', 'Why'], todo.map(n => [code(n.param), n.reason])));
    out.push('', `Element details (parts, CSS custom properties, methods, accessibility): ${code(tag)} in the \`plainkit-sdk\` skill.`);
    return out.join('\n');
}

/** What the pk-table element does today, as sentences derived from its meta (so they cannot go stale): the current-row prop, keyboard rows, a sort that clears. */
function tableFacts(src) {
    const el = src.api.find(e => e.tag === 'pk-table');
    if (!el) return [];
    const prop = n => el.props.find(p => p.name === n);
    const event = n => el.events.find(e => e.name === n);
    const facts = [];
    if (prop('currentRow')) facts.push('The table marks the open record with `CurrentRow` (the row id: tinted, an accent bar and `aria-current`); `PkDataList` passes it through.');
    if (/tab stop/.test(prop('clickable')?.description ?? '')) facts.push('`Clickable` rows are keyboard stops (Enter or Space activates).');
    if (/cleared/.test(event('pk-sort')?.description ?? '')) facts.push('A third activation of a sortable header clears the sort (`OnSort` reports a null key and direction).');
    if (/in the cards layout too/.test(el.props.find(p => p.name === 'columns')?.description ?? '')) facts.push('A `HidePhone` column is hidden in the `cards` layout too.');
    return facts;
}

const TOOL_COMPONENTS = ['PkGallery', 'PkCodeExplorer', 'PkScorecard', 'PkPerformance', 'PkConsole', 'PkLogs', 'PkLogSettings', 'PkQuality', 'PkThemeEditor', 'PkDevTools', 'PkStyles', 'PkDevToolsPage'];

function blazorFiles(src) {
    const files = new Map();
    const enumMap = new Map([...src.manifest.enums.map(e => [e.name, { name: e.name, members: e.members }]), ...src.enums.map(e => [e.name, e])]);
    const bySlug = new Map();
    for (const e of src.api) { const s = groupSlug(e.group); if (!bySlug.has(s)) bySlug.set(s, []); bySlug.get(s).push(e); }
    const index = [];
    for (const [slug, els] of [...bySlug].sort((a, b) => a[0].localeCompare(b[0]))) {
        els.sort((a, b) => a.tag.localeCompare(b.tag));
        files.set(`references/components-${slug}.md`, [`# Components: ${groupTitle(slug)}`, '', stamp(src, 'Generated/*.razor, blazor/mappings, generated.manifest.json and core/dist/elements/api.json'), '', 'Every component renders its element with the parameters you set as attributes. An attribute that is not a parameter (`id`, `class`, `data-*`, `aria-*`, ...) is put on the element as it is, and a `class` is added to the component\'s own (`ExtraClass` on a component that lists it). Names are `Pk` plus the tag in PascalCase.', '', els.map(e => componentSection(src, e.tag, enumMap)).join('\n\n')].join('\n') + '\n');
        for (const e of els) { const c = componentOfTag(e.tag); const r = src.razor[c]; index.push([code(c), code(e.tag), e.group, r ? (r.kind === 'generated' ? 'generated' : 'hand-written') : 'not available', code(`components-${slug}.md`)]); }
    }
    index.sort((a, b) => a[0].localeCompare(b[0]));
    files.set('references/components-index.md', ['# Components: index', '', stamp(src, 'Generated/*.razor and generated.manifest.json'), '', `${index.length} elements; ${index.filter(r => r[3] !== 'not available').length} have a component. Open the file in the last column for the parameters.`, '', table(['Component', 'Element', 'Group', 'Status', 'File'], index), ''].join('\n'));

    const enumsUsed = src.manifest.enums;
    files.set('references/enums.md', ['# Enums', '', stamp(src, 'generated.manifest.json, PkEnums.cs and PkLogging.cs'), '', 'A parameter whose element prop has a fixed set of values is an enum; each member is one attribute value (`ButtonVariant.Primary` is `primary`). A null enum leaves the element\'s own default.', '',
        '## Generated (from the element API)', '', table(['Enum', 'Members', 'Used by'], enumsUsed.map(e => [code(e.name), e.members.map(code).join(' '), e.usedBy.map(code).join(' ')])), '',
        '## Hand-written', '', table(['Enum', 'Members'], src.enums.map(e => [code(e.name), e.members.map(code).join(' ')])), ''].join('\n'));

    const evRows = src.events.map(x => [code(x.event), code(x.name), x.raisedBy.map(code).join(' '), x.fields.map(f => `${f.name}: ${f.type}`).join(', ')]);
    files.set('references/events.md', ['# Events', '', stamp(src, 'Generated/PkGeneratedEvents.cs'), '', 'An event with a detail gives `EventCallback<PkXxxEventArgs>`; the args class has one nullable property per field of the element\'s detail (set only when the element sends it). An event with no detail gives `EventCallback`; `click` gives `MouseEventArgs`. A change event that drives a value is also exposed as a two-way `@bind-` parameter. **Every** `pk-*` event of every element is registered with Blazor and mapped to its args class (the generated `EventHandlers` class; Razor only finds a class with that exact name), so raw markup works too: `<pk-table @onpk-sort="OnSort">` with `void OnSort(PkSortEventArgs e)`, no JavaScript needed (add `@using PlainKit.Blazor`).', '', table(['Element event', 'Args class', 'Raised by', 'Fields'], evRows), '',
        `Events without a detail (${src.manifest.events.filter(n => !src.events.some(x => x.event === n)).map(code).join(' ')}) use \`EventArgs\`.`, ''].join('\n'));

    // the list component: no element of its own, so it is not in the per-group component files
    const dl = src.razor.PkDataList;
    if (dl) {
        const sig = name => new RegExp('public sealed record ' + name + '(<\\w+>)?\\(([^)]*)\\)').exec(src.cs.listTypesText);
        const req = sig('PkListRequest'), res = sig('PkListResult');
        files.set('references/data-list.md', ['# PkDataList: a searchable, sortable, server-paged list', '', stamp(src, 'Components/PkDataList.razor, PkListTypes.cs and PkTableTypes.cs'), '',
            'A hand-written component with no element of its own. It is a `PkTable` in manual mode with a `PkInput` (type search) in the toolbar and a `PkPagination` in the footer. It owns the state (search text, sort key and direction, page, page size, total) and asks you for one page at a time through `Load`; you own the data. Use it for any list you load from a database a page at a time. For a table you fill yourself, use `PkTable`.', '',
            `Request: ${code('record PkListRequest(' + (req?.[2] ?? '') + ')')}, with ${src.cs.listRequest.map(m => code(m.decl) + ' (' + m.doc + ')').join(' and ')}. Result: ${code('record PkListResult<T>(' + (res?.[2] ?? '') + ')')}.`, '',
            'Rules the component follows: a new search, sort or page size goes back to page 1; the search box debounces itself (`SearchDebounceMs`, the element\'s own timer, no .NET timer and no JavaScript); a request that is replaced by a newer one has its `CancellationToken` cancelled and its result ignored, so no stale rows appear; while a request is in flight the table is `loading` (no rows); when the total shrinks below the current page (rows deleted elsewhere) it settles on the last page that exists and loads it; a thrown `Load` shows an error with a Retry button (`OnLoadError` reports it). `ReloadAsync()` loads the current page again (after the host saved something). The first column is the row\'s identity: it stays in the phone `cards` layout, marks the current row (`CurrentId`: bold and `aria-current`) and, with `OnRowClick`, holds a link so the row is reachable by keyboard. A column `Key` is used exactly as you write it: in the column definition, the row, the cell slot and the keys reported back, so `PkListRequest.SortKey` is the `Key` of the sorted column verbatim (PascalCase in, PascalCase out; nothing is camelCased). Map it to your repository column yourself, and match it case-insensitively if you like. A column without `Text` or `Cell` finds the item property in any casing.', '',
            tableFacts(src).length ? tableFacts(src).join(' ') : '',
            '',
            '## `PkDataList`', '', table(['Parameter', 'Type', 'Description'], dl.params.map(p => [code(p.name), code(p.type), p.doc])), '',
            '## `PkTableColumn<TItem>` (the columns of `PkDataList` and `PkTable`)', '', table(['Member', 'Description'], src.cs.tableColumn.map(m => [code(m.decl), m.doc])), ''].join('\n'));
    }

    // a plain field bound to a model property, from a list of specs: no element of its own (issue 222)
    const fg = src.razor.PkFieldGroup;
    if (fg) {
        files.set('references/field-group.md', ['# PkFieldGroup: a plain field bound to a model property, from a list of specs', '', stamp(src, 'Components/PkFieldGroup.razor and PkFieldGroupTypes.cs'), '',
            'A hand-written component with no element of its own. Renders a `PkField` plus the right control (`PkInput`, `PkSelect`, `PkTextarea` or `PkCheckbox`) for each `PkFieldSpec<TItem>`, reading and writing `Model` through the spec\'s `Get`/`Set` (`Func<TItem, string?>`/`Action<TItem, string?>`: every control\'s own value-shaped parameter is a string, so a field spec deals in the same currency; `PkInput.Min`/`Max`/`Step`/`MaxLength` are strings for the same reason). It only covers a plain field bound 1:1 to a property; a field whose visibility depends on the current data, or whose value is computed rather than a plain mirror, stays hand-written next to it, the same `PkField` plus control you would already write. Composes with `PkForm`\'s own validation with no extra wiring: every control it renders is the same real element a hand-written field would use.', '',
            '```razor', '<PkForm>', '    <PkFieldGroup TItem="Order" Fields="_fields" Model="_order" ModelChanged="Save" />', '</PkForm>', '', '@code {', '    private Order _order = new();', '    private IReadOnlyList<PkFieldSpec<Order>> _fields =', '    [', '        new() { Key = "name", Label = "Name", Required = true, Get = order => order.Name, Set = (order, v) => order.Name = v ?? "" },', '        new() { Key = "qty", Label = "Quantity", Kind = PkFieldKind.Number, Min = "1", Get = order => order.Qty.ToString(), Set = (order, v) => order.Qty = int.Parse(v ?? "0") },', '        new() { Key = "status", Label = "Status", Kind = PkFieldKind.Select, Options = [new("open", "Open"), new("closed", "Closed")], Get = order => order.Status, Set = (order, v) => order.Status = v ?? "" },', '    ];', '}', '```', '',
            '## `PkFieldGroup`', '', table(['Parameter', 'Type', 'Description'], fg.params.map(p => [code(p.name), code(p.type), p.doc])), '',
            '## `PkFieldSpec<TItem>`', '', 'One field: `Key`, `Label`, `Get` (`Func<TItem, string?>`), `Set` (`Action<TItem, string?>`), `Kind` (`PkFieldKind`, default `Text`), `Hint`, `Required`, `Min`, `Max`, `Step`, `MaxLength`, `Pattern`, `Options` (`IReadOnlyList<PkFieldOption>`, `Select` only).', '',
            '## `PkFieldKind`', '', 'Text, Number, Email, Password, Date, Time, Url, Tel (all `PkInput`, `Type` set from the member), Textarea, Select, Checkbox (`Get`/`Set` still deal in strings: checked is a non-empty value other than "false").', ''].join('\n'));
    }

    // pk-table's raw/slotted default slot (one complete table) composed from three RenderFragments: no element of its own (issue 228)
    const rt = src.razor.PkRawTable;
    if (rt) {
        files.set('references/raw-table.md', ['# PkRawTable: HeadContent/ChildContent/FootContent composed into pk-table\'s raw slot', '', stamp(src, 'Components/PkRawTable.razor'), '',
            'A hand-written component with no element of its own. `pk-table`\'s default slot takes one complete table (`thead`, `tbody`, `tfoot`) when you want to author the markup yourself rather than give the element `Columns`/`Items` (`PkTable<TItem>`) — the right design for the element, but Blazor composes with `RenderFragment` parameters, not one blob of markup. `PkRawTable` composes `HeadContent`, `ChildContent` and `FootContent` into that one blob, so a static header and a `@foreach` body over your own collection do not need a hand-written wrapper. Not a new visual primitive: `pk-table`\'s raw mode already supplies the scroll frame, `ToolbarContent`/`FooterContent` and sticky header/column; this only supplies the missing glue.', '',
            '```razor', '<PkRawTable Label="Orders" Caption="Recent orders">', '    <HeadContent><tr><th>Number</th><th>Total</th></tr></HeadContent>', '    <ChildContent>', '        @foreach (var order in _orders)', '        {', '            <tr><td>@order.Number</td><td>@order.Total.ToString("C")</td></tr>', '        }', '    </ChildContent>', '</PkRawTable>', '```', '',
            '## `PkRawTable`', '', table(['Parameter', 'Type', 'Description'], rt.params.map(p => [code(p.name), code(p.type), p.doc])), ''].join('\n'));
    }

    // reading picked files: PkDropzone and PkImageGallery with Blazor's InputFile (issue #83, then #201 for the gallery); a workflow, so no element table
    files.set('references/file-upload.md', ['# Reading picked files: PkDropzone and PkImageGallery with InputFile', '', stamp(src, 'the pk-dropzone and pk-image-gallery elements and their generated components'), '',
        'Both elements keep their files in their own shadow-tree input, which Blazor cannot read. To read the bytes use the Blazor `InputFile`: put it in the `input` slot and the element only draws the target. There is no `IBrowserFile` marshalling in Plainkit and no interop per render; `InputFileChangeEventArgs`, `IBrowserFile` and `OpenReadStream` belong to Blazor and work the same in Blazor Server and Blazor WebAssembly.', '',
        '## `PkDropzone`', '',
        '```razor', '@using Microsoft.AspNetCore.Components.Forms', '',
        '<PkDropzone Label="Files to upload" BrowseLabel="Choose files" Multiple="true">',
        '    <ChildContent>',
        '        <InputFile slot="input" multiple OnChange="OnChange" />',
        '        Drop files here or click to choose',
        '    </ChildContent>',
        '    <HintContent>Text files, up to 1 MB each</HintContent>',
        '</PkDropzone>', '',
        '@code {',
        '    private async Task OnChange(InputFileChangeEventArgs e)',
        '    {',
        '        foreach (var file in e.GetMultipleFiles(10))',
        '        {',
        '            using var stream = file.OpenReadStream(1024 * 1024); // the limit is yours; the default is 500 KB',
        '            // read or copy the stream',
        '        }',
        '    }',
        '}', '```', '',
        'Rules:', '',
        '- `slot="input"` goes on the `InputFile` itself (it passes unknown attributes to the `<input>`), as a direct child of `PkDropzone`, so the input covers the whole zone. When any named fragment (`HintContent`) is used, wrap the title and the `InputFile` in an explicit `<ChildContent>`.',
        '- A drop and the picker (the zone itself, or the `BrowseLabel` button) both end in the `OnChange` of the `InputFile`: a drop puts the dropped files into that input and raises its `change` event. A single-file input (no `multiple`) keeps the first dropped file; a drop without files does nothing.',
        '- `OnChange` is the source of truth. In this mode the zone does not check `Accept`, `MaxFileSizeBytes` or `MaxFiles`, does not draw a file list and does not raise `OnFiles`: use `accept` and `multiple` on the `InputFile`, check `IBrowserFile.Size` and `ContentType` in `OnChange`, and set `maxAllowedSize` in `OpenReadStream` (it throws `IOException` past the limit).',
        '- `BrowseLabel` and `Disabled` keep working (`Disabled` blocks the button and drops). Render the file list yourself from the `IBrowserFile`s.',
        '- Without an `InputFile` (no slot), `OnFiles` reports counts and the accepted and rejected files stay in the browser: use it for client-side checks, not for reading bytes.', '',
        '## `PkImageGallery`', '',
        'The add tile works the same way, through its own `InputContent` parameter (a dedicated named slot, not `ChildContent`: `PkImageGallery` has no default slot). The wrapper sets `slot="input"` for you, so the `InputFile` itself needs none.', '',
        '```razor', '@using Microsoft.AspNetCore.Components.Forms', '',
        '<PkImageGallery Images="@_images" Editable="true">',
        '    <InputContent>',
        '        <InputFile multiple OnChange="OnChange" />',
        '    </InputContent>',
        '</PkImageGallery>', '',
        '@code {',
        '    private IReadOnlyList<PkGalleryImage> _images = [];',
        '',
        '    private async Task OnChange(InputFileChangeEventArgs e)',
        '    {',
        '        foreach (var file in e.GetMultipleFiles(10))',
        '        {',
        '            using var stream = file.OpenReadStream(5 * 1024 * 1024);',
        '            // read or copy the stream, then append a PkGalleryImage to _images',
        '        }',
        '    }',
        '}', '```', '',
        '`OnAdd` (the `pk-add` event) does not fire for a pick made on the slotted `InputFile` — `OnChange` is the only read path, the same split as `PkDropzone`\'s `OnFiles`. Without an `InputFile`, `OnAdd` still reports the chosen files\' names, but never their bytes.', ''].join('\n'));

    // tools and setup
    const toolRows = TOOL_COMPONENTS.filter(c => src.razor[c]).map(c => {
        const r = src.razor[c];
        return [`## ${code(c)}`, '', r.routes.length ? `Routable page: ${r.routes.map(code).join(', ')}.` : '', r.params.length ? table(['Parameter', 'Type', 'Description'], r.params.map(p => [code(p.name), code(p.type), (enumMap.get(p.type.replace(/\?$/, '')) ? `Values: ${enumMap.get(p.type.replace(/\?$/, '')).members.join(', ')}. ` : '') + p.doc])) : 'No parameters.'].filter(x => x !== '').join('\n\n');
    });
    const members = (title, ms) => ms.length ? [`## ${title}`, '', table(['Member', 'Description'], ms.map(m => [code(m.decl), m.doc])), ''].join('\n') : '';
    files.set('references/devtools.md', ['# Dev tools and tool components', '', stamp(src, 'Components/*.razor and the C# sources'), '',
        'In the Development environment, `/_plainkit` serves the toolkit\'s own tools: the Gallery, Files and Scorecard workspaces, and the SDK\'s dev tools dock (`PkDevTools`: Console, Logs, Logging, Performance, Quality, Inspector, Theme, plus the Blazor and Components tabs of PlainKit.Blazor). Serve it elsewhere with `AddPlainKit(o => o.DevTools = true)`. The Files tab reads a folder on the server (`PkOptions.SourceRoot`), so it does not work in a browser-only app. Each tool is also a component you can place on a page of your own:', '',
        toolRows.join('\n\n'), '', members('PkScoreTarget', src.cs.scoreTarget), members('PkSnapshot', src.cs.snapshot), ''].join('\n'));
    files.set('references/setup-and-options.md', ['# Setup, options and services', '', stamp(src, 'PkOptions.cs, PkLogging.cs, PkRuntime.cs, PkAssets.cs and the extension methods'), '',
        'Register the services, add `<PkStyles />` once, first in the `<head>` of `App.razor` (a plain in-place link: it must come before the app\'s own stylesheets), and add the assembly to the router only when you serve the dev tools page. `AddPlainKit(Action<PkOptions>?)` registers `PkRuntime`, `IPkLog`, the options and the dev tools services. `AddPlainKitDevTools()` (chained after `MapRazorComponents`) makes `/_plainkit` routable. At startup the runtime compares the JavaScript version with `PkAssets.Version` and logs one warning (`ILogger` category `PlainKit.blazor`, SDK scope `blazor`) when they differ. The toolkit is served as static web assets under `' + (src.cs.assets.find(m => /Root/.test(m.decl)) ? '_content/PlainKit.Blazor/plainkit/' : '') + '`.', '',
        members('PkOptions', src.cs.options), members('PkLoggingOptions', src.cs.logging), members('IPkLog', src.cs.ipklog), members('PkRuntime', src.cs.runtime), members('PkAssets', src.cs.assets)].join('\n'));
    const cats = { wrapper: src.manifest.notGenerated.filter(n => n.reason.startsWith('wrapper behaviour')), css: src.manifest.notGenerated.filter(n => n.reason.startsWith('sets the ')), type: [...src.manifest.notGenerated.filter(n => n.reason.startsWith('type not yet defined')), ...src.manifest.typesToDefine] };
    const missing = src.manifest.skipped.filter(s => !s.handWritten);
    files.set('references/known-gaps.md', ['# Not yet available and known gaps', '', stamp(src, 'generated.manifest.json, the pk-table element meta and the "Alpha status" section of the package README'), '', `PlainKit.Blazor ${src.version} is an alpha.`, '',
        '- **Blazor Server is verified** in a live host (the Playground app: the `/generated` page, the dev tools page, `IPkLog` and the `ILogger` forwarder).',
        '- **Standalone Blazor WebAssembly is verified** in a live host (the `PlainKit.WasmPlayground` sample in headless Chrome: assets, `pk-*` events, two-way binds, `PkTable`/`PkDataList`, `ILogger` forwarding, `IPkLog`, the dev tools page). The Files tool needs a server folder, so in a browser-only app it shows "No source to browse". Not run: AOT and the Web App `InteractiveWebAssembly` render mode.', '',
        `## Components that do not exist yet (${missing.length})`, '', (missing.length ? missing.map(m => `- ${code(m.component)}: use the element ${code('<' + m.tag + '>')} directly in markup (raw \`pk-*\` tags work; see the SKILL for how they get loaded).`).join('\n') : 'None: every element has a component.'), '',
        ...(tableFacts(src).length ? ['## Table and list behaviour today (from the `pk-table` element)', '', ...tableFacts(src).map(x => '- ' + x), ''] : []),
        `## Wrapper-only parameters that do not exist (${cats.wrapper.length})`, '', 'Behaviour of the old wrappers that is not a property of the element. They are not generated; do not use them.', '', table(['Component', 'Parameter', 'Why'], cats.wrapper.map(n => [code(n.component), code(n.param), n.reason])), '',
        `## Parameters set through a CSS custom property (${cats.css.length}), not generated`, '', table(['Component', 'Parameter', 'Why'], cats.css.map(n => [code(n.component), code(n.param), n.reason])), '',
        `## Parameters whose type is not defined yet (${cats.type.length})`, '', 'Not generated until the type exists.', '', table(['Component', 'Parameter', 'Why'], cats.type.map(n => [code(n.component), code(n.param), n.reason])), '',
        ''].join('\n'));
    // logging
    files.set('references/logging.md', ['# Logging from Blazor', '', stamp(src, 'PkLogging.cs, PkOptions.cs, PkRuntime.cs and the package README'), '',
        section(src.blazorReadme, 'Logging'), '',
        '## How the bridge works', '', '- `PkOptions.Logging` (a `PkLoggingOptions`) is applied to the SDK logger (`configureLogging`) when the first PlainKit component (or an `IPkLog` call) runs on a circuit or page.',
        '- With `ForwardToILogger = true`, a JavaScript sink sends each SDK entry to .NET, which writes it to `ILogger` with the category `PlainKit.<scope>` (an empty scope is `PlainKit`). `debug`, `info`, `warn`, `error` map to Debug, Information, Warning, Error; `silent` is never forwarded. The forwarder filters by `ForwardMinimumLevel` (default Warn), `ForwardScopes` (empty means all; a trailing `*` matches a prefix) and `ForwardExcludeScopes` (wins).',
        '- `IPkLog` writes into the SDK log from .NET (so `PkLogs` and the dev tools Logs tab show your entries beside the SDK\'s). Entries written this way are not echoed back to `ILogger`. Its calls never throw while prerendering or after the circuit disconnects (they are dropped).', '',
        members('PkLoggingOptions', src.cs.logging), members('IPkLog', src.cs.ipklog), ''].join('\n'));
    return { files, slugs: [...bySlug.keys()].sort() };
}

// ---------------------------------------------------------------- SKILL.md wrappers

function fill(template, vars) { return lf(template).replace(/\{\{([\w-]+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`skill template uses {{${k}}} which the generator does not provide`); return vars[k]; }); }

export const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
export function parseFrontmatter(text) {
    const m = FRONTMATTER.exec(lf(text));
    if (!m) return null;
    const out = {};
    for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    return out;
}

/** The whole bundle: Map(path relative to dist/skills -> LF text). */
export function generate(src = collect()) {
    const out = new Map();
    const sdk = sdkElementFiles(src);
    const blazor = blazorFiles(src);
    const put = (skill, rel, text) => out.set(`${skill}/${rel}`, text.replace(/\n*$/, '\n'));
    for (const [rel, text] of sdk.files) put('plainkit-sdk', rel, text);
    put('plainkit-sdk', 'references/templates.md', templatesMd(src));
    put('plainkit-sdk', 'references/patterns.md', patternsMd(src, 'patterns'));
    put('plainkit-sdk', 'references/layouts.md', patternsMd(src, 'layouts'));
    put('plainkit-sdk', 'references/tools.md', toolsMd(src));
    put('plainkit-sdk', 'references/logging.md', loggingMd(src));
    put('plainkit-sdk', 'references/openers.md', openersMd(src));
    put('plainkit-sdk', 'references/theming.md', themingMd(src));
    put('plainkit-sdk', 'references/loading.md', loadingMd(src));
    put('plainkit-sdk', 'references/known-gaps.md', sdkGapsMd(src));
    put('plainkit-sdk', 'references/upgrading.md', upgradingMd(src, 'The installed version is `dist/manifest.json`\'s `version` field, or the `PK_VERSION` export of `dist/js/version.js`. The target is the version you are moving to (latest release unless the user names one).'));
    for (const [rel, text] of blazor.files) put('plainkit-blazor', rel, text);
    put('plainkit-blazor', 'references/upgrading.md', upgradingMd(src, 'The installed version is the `Version` of the `PackageReference Include="PlainKit.Blazor"` in the app\'s `.csproj`. The target is the version you are moving to (latest release unless the user names one).'));
    const describe = { 'elements-index.md': 'every tag, its group and the file that documents it (start here to find an element)', 'templates.md': 'full-page starting points', 'patterns.md': 'composed patterns (confirm delete, filter table, forms, ...)', 'layouts.md': 'page anatomies (list, record, setup, tool, wizard)', 'tools.md': 'dev tools dock, logs, logging settings, scorecard, performance, console, quality, theme editor, code explorer, gallery: `mountX(container, options)` and events', 'logging.md': 'the SDK logger: levels, scopes, routes, `?pk-log=`, `PkLog`', 'openers.md': '`data-open`, `data-toggle`, `data-close`', 'theming.md': 'tokens and themes', 'loading.md': 'ways to load Plainkit, `initPlainkit`, the element loader', 'known-gaps.md': 'what is not built, what not to assume', 'upgrading.md': 'moving this app to a newer Plainkit version: a blast-radius checklist, not a changelog readout' };
    const listRefs = (skill, extra) => [...[...out.keys()].filter(k => k.startsWith(skill + '/references/')).map(k => k.split('/').pop())].sort().map(f => `- \`references/${f}\`${extra[f] ? `: ${extra[f]}` : ''}`).join('\n');
    const sdkGroupFiles = sdk.slugs.map(s => `- \`references/elements-${s}.md\`: ${groupTitle(s)}`).join('\n');
    const bzGroupFiles = blazor.slugs.map(s => `- \`references/components-${s}.md\`: ${groupTitle(s)}`).join('\n');
    const bzDescribe = { 'components-index.md': 'every element, its component, status and file (start here to find a component; for parts, CSS custom properties, methods and a11y notes, open the same tag in the plainkit-sdk skill instead)', 'data-list.md': '`PkDataList`: a searchable, sortable, server-paged list (`Load`, `PkListRequest`, `PkListResult`)', 'field-group.md': '`PkFieldGroup`: a plain field bound to a model property, from a list of `PkFieldSpec<TItem>`', 'raw-table.md': '`PkRawTable`: HeadContent/ChildContent/FootContent composed into pk-table\'s raw slot', 'file-upload.md': '`PkDropzone`/`PkImageGallery` with `InputFile`: reading picked and dropped files', 'setup-and-options.md': '`AddPlainKit`, `PkOptions`, `PkRuntime`, `PkAssets`', 'devtools.md': '`/_plainkit` and the tool components', 'logging.md': '`IPkLog` and the `ILogger` bridge', 'events.md': 'event args classes', 'enums.md': 'enum values', 'known-gaps.md': 'what does not exist yet, WebAssembly status', 'upgrading.md': 'moving this app to a newer PlainKit.Blazor version: a blast-radius checklist, not a changelog readout' };
    for (const skill of SKILL_NAMES) {
        const tpl = fs.readFileSync(path.join(here, 'skills', skill, 'SKILL.md'), 'utf8');
        const isSdk = skill === 'plainkit-sdk';
        const text = fill(tpl, {
            version: src.version, stamp: stampLine(src), elementCount: String(src.api.length),
            references: isSdk ? [listRefs(skill, describe).split('\n').filter(l => !/references\/elements-(?!index)/.test(l)).join('\n'), sdkGroupFiles].join('\n') : [listRefs(skill, bzDescribe).split('\n').filter(l => !/references\/components-(?!index)/.test(l)).join('\n'), bzGroupFiles].join('\n'),
            missing: src.manifest.skipped.filter(s => !s.handWritten).map(s => '`' + s.component + '`').join(', ') || 'none (every element has a component)',
            breakpoints: src.breakpoints.map(b => `\`${b.name}\` ${b.width}`).join(', '),
            wrapperCount: String(src.manifest.notGenerated.filter(n => n.reason.startsWith('wrapper behaviour')).length),
        });
        out.set(`${skill}/SKILL.md`, text.replace(/\n*$/, '\n'));
    }
    return out;
}

export function diskFiles(dir = SKILLS_DIR) {
    const out = new Map();
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) if (e.isFile()) out.set(path.relative(dir, path.join(e.parentPath, e.name)).replaceAll('\\', '/'), fs.readFileSync(path.join(e.parentPath, e.name), 'utf8'));
    return out;
}

export function differences(gen = generate(), dir = SKILLS_DIR) {
    const disk = diskFiles(dir);
    const d = [];
    for (const [f, text] of gen) { if (!disk.has(f)) d.push(`missing: ${f}`); else if (disk.get(f) !== crlf(text)) d.push(`changed: ${f}`); }
    for (const f of disk.keys()) if (!gen.has(f)) d.push(`extra: ${f}`);
    return d.sort();
}

export function write(gen = generate(), dir = SKILLS_DIR) {
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [f, text] of gen) { const p = path.join(dir, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, crlf(text)); }
    return gen.size;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let gen;
    try { gen = generate(); } catch (e) { console.error(`build-skills: ${e.message}`); process.exit(2); }
    if (process.argv.includes('--check')) {
        const d = differences(gen);
        if (d.length) { console.error(`core/dist/skills is out of date (${d.length} differences); run node scripts/build-skills.mjs\n${d.slice(0, 15).join('\n')}`); process.exit(1); }
        console.log(`core/dist/skills matches its sources (${gen.size} files)`);
    } else {
        const n = write(gen);
        build({ write: true }); // the SRI manifest lists the skills, so rebuild it now that they are on disk
        console.log(`${n} skill files written to core/dist/skills; dist/manifest.json refreshed`);
    }
}
