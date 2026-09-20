// SDK build: node core/tools/build.mjs   (dependency-free, deterministic; run it after editing any component folder)
//
// Each component lives in components/<name>/: <name>.html (canonical markup, one fragment per @sample marker), <name>.css,
// <name>.js (only when it has behaviour), <name>.meta.json (controls, contract, Blazor equivalent), <name>.test.mjs (optional).
// components/order.json is the cascade order. This script generates, and never hand-edit these:
//   plainkit.css                     @imports every component css in order, between tokens/base and a11y
//   gallery/gallery.data.js     the gallery's data: the meta files and html fragments assembled (+ gallery.static.js, + the PARAMS block)
//   dist/<tool>/                the tool modules (code-explorer, ...) from modules/, paths resolved for the dist layout
//   dist/plainkit.css, dist/plainkit.min.css, dist/plainkit.js, dist/js/, dist/components/<name>/   what a non-Blazor project consumes

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateApi, propsObject } from './element-api.mjs';
import { allManifests } from './element-manifests.mjs';
import { galleryDist } from './gallery-dist.mjs';
import { modulesDist } from './modules-dist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const comp = path.join(root, 'components');
// Every generated file goes through w(): kept in `out` (path -> exact text) and written to disk only when build({ write: true }) (the
// default). A test builds with write: false and compares `out` to the files on disk, so it never rewrites files other tests read.
let out = new Map();
let writing = true;
const w = (rel, text) => { const crlf = text.replace(/\r?\n/g, '\r\n'); out.set(rel, crlf); if (!writing) return; const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crlf); };
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

export function loadComponents(dir = comp) {
    const { order } = JSON.parse(read(path.join(dir, 'order.json')));
    const folders = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
    const problems = [];
    for (const f of folders) {
        if (!order.includes(f)) problems.push(`components/${f} is not listed in order.json`);
        for (const need of [`${f}.html`, `${f}.meta.json`]) if (!fs.existsSync(path.join(dir, f, need))) problems.push(`components/${f} is missing ${need}`);
    }
    for (const o of order) if (!folders.includes(o)) problems.push(`order.json lists ${o} but there is no folder`);
    if (problems.length) throw new Error(problems.join('\n'));
    return order.map(name => {
        const p = n => path.join(dir, name, `${name}.${n}`);
        return { name, css: fs.existsSync(p('css')) ? read(p('css')) : null, js: fs.existsSync(p('js')) ? read(p('js')) : null, html: read(p('html')), meta: JSON.parse(read(p('meta.json'))) };
    });
}

// The fragments of a component's html: [{ control, title, height?, script?, html }].
export function samplesOf(html) {
    const out = [];
    const rx = /<!-- @sample control="([^"]+)" title=("(?:[^"\\]|\\.)*")(?: height="(\d+)")? -->\n([\s\S]*?)(?=\n<!-- @sample |$)/g;
    for (const m of html.matchAll(rx)) {
        let body = m[4]; let script;
        const s = /^<!-- @boot ([\w-]+) -->\n/.exec(body);
        if (s) { script = s[1]; body = body.slice(s[0].length); }
        out.push({ control: m[1], title: JSON.parse(m[2]), ...(m[3] ? { height: Number(m[3]) } : {}), ...(script ? { script } : {}), html: body.trim() });
    }
    return out;
}

// Samples live in their own folders, each with a meta file: samples/templates/<id>/, samples/patterns/<id>/ and layouts/<id>/.
// The meta lists the components the sample uses (a test keeps that list equal to what its markup carries).
export const SAMPLE_GROUPS = [['templates', 'samples/templates'], ['patterns', 'samples/patterns'], ['layouts', 'layouts']];
export function loadSamples(rootDir = root) {
    const groups = {};
    for (const [group, dir] of SAMPLE_GROUPS) {
        const base = path.join(rootDir, dir);
        const list = [];
        for (const e of fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
            const metaFile = path.join(base, e.name, `${e.name}.meta.json`); const htmlFile = path.join(base, e.name, `${e.name}.html`);
            if (!fs.existsSync(metaFile) || !fs.existsSync(htmlFile)) throw new Error(`${dir}/${e.name} needs ${e.name}.html and ${e.name}.meta.json`);
            const meta = JSON.parse(read(metaFile));
            list.push({ ...meta, ...(group === 'templates' ? {} : { html: read(htmlFile).trim() }), file: `${dir}/${e.name}/${e.name}.html` });
        }
        groups[group] = list.sort((a, b) => a.order - b.order);
    }
    return groups;
}

// Custom elements: elements/<name>/ holds <name>.html (the template), <name>.css, <name>.meta.json (the API), and <name>.js when the element
// has behaviour (export default Base => class extends Base { ... }). The build validates the API against the template and css and generates
// one module per element with the template and styles inlined, so nothing is fetched at runtime.
export function loadElementSources(rootDir = root) {
    const dir = path.join(rootDir, 'elements');
    if (!fs.existsSync(dir)) return [];
    const problems = []; const list = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
        const f = ext => path.join(dir, e.name, `${e.name}.${ext}`);
        for (const need of ['html', 'css', 'meta.json']) if (!fs.existsSync(f(need))) problems.push(`elements/${e.name} is missing ${e.name}.${need}`);
        if (problems.length) continue;
        const meta = JSON.parse(read(f('meta.json'))); const template = read(f('html')).trim(); const css = read(f('css'));
        const behaviour = fs.existsSync(f('js')) ? read(f('js')) : null;
        problems.push(...validateApi(meta, { template, css, name: `elements/${e.name}` }));
        if (meta.tag !== `pk-${e.name}`) problems.push(`elements/${e.name}: tag must be pk-${e.name}`);
        list.push({ name: e.name, meta, template, css, behaviour });
    }
    if (problems.length) throw new Error(problems.join('\n'));
    return list;
}

export function elementModule(el, { coreImport, minifyCss = false }) {
    // A behaviour file imports shared modules as '../../js/x.js' (its source location); the generated module lives elsewhere in dist.
    const jsBase = coreImport.replace(/element\.js$/, '');
    const beh = el.behaviour ? el.behaviour.replace(/^[ \t]*\/\/.*\r?\n/gm, '').replace(/(from ')\.\.\/\.\.\/js\//g, `$1${jsBase}`).replace(/^export default /m, 'const behaviour = ').trimEnd().replace(/;?$/, ';') : 'const behaviour = Base => Base;';
    const m = el.meta;
    return `// GENERATED by tools/build.mjs from elements/${el.name}/: do not edit.
import { PkElement, define } from '${coreImport}';
${beh}
export default define(class extends behaviour(PkElement) {
    static tag = ${JSON.stringify(m.tag)};
    static props = ${JSON.stringify(propsObject(m))};
    static delegatesFocus = ${Boolean(m.delegatesFocus)};
    static formAssociated = ${Boolean(m.formAssociated)};
    static template = ${JSON.stringify(el.template)};
    static css = ${JSON.stringify(minifyCss ? minify(el.css) : el.css)};
});
`;
}

const minify = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/;}/g, '}').trim();

export function build({ write = true } = {}) {
    writing = write; out = new Map();
    const comps = loadComponents();
    // plainkit.css
    const withCss = comps.filter(c => c.css !== null).map(c => c.name);
    w('plainkit.css', `/* GENERATED by tools/build.mjs from components/order.json: do not edit. Entry point for a non-Blazor page. base/a11y.css is last on purpose. */\n@import url("tokens/tokens.css");\n@import url("base/base.css");\n${withCss.map(n => `@import url("components/${n}/${n}.css");`).join('\n')}\n@import url("elements/elements.css");\n@import url("base/a11y.css");\n`);

    // gallery data
    const controls = [];
    for (const c of comps) {
        const samples = samplesOf(c.html);
        for (const m of c.meta.controls) controls.push({ ...m, samples: samples.filter(s => s.control === m.id).map(({ control, ...s }) => s) });
    }
    const samples = loadSamples();
    const elements = loadElementSources();
    const foucRule = elements.length ? `${elements.map(e => `${e.meta.tag}:not(:defined)`).join(',')}{visibility:hidden}` : '';
    w('elements/elements.css', `/* GENERATED by tools/build.mjs: hides an pk-* element until its module has defined it, so there is no flash of unstyled content. */\n${foucRule}\n`);
    for (const el of elements) w(`elements/${el.name}/${el.name}.element.js`, elementModule(el, { coreImport: '../../js/element.js' }));
    w('elements/registry.js', `// GENERATED by tools/build.mjs: tag -> module, relative to this file. js/loader.js imports only the modules a page uses.\nexport default ${JSON.stringify(Object.fromEntries(elements.map(e => [e.meta.tag, `./${e.name}/${e.name}.element.js`])), null, 4)};\n`);
    const paramsRegion = /\/\/ <generated:params>[\s\S]*?\/\/ <\/generated:params>/.exec(read(path.join(root, 'site', 'gallery', 'gallery.data.js')))?.[0] ?? '// <generated:params>\nexport const PARAMS = {};\n// </generated:params>';
    w('site/gallery/gallery.data.js', `// GENERATED by tools/build.mjs from components/*/*.meta.json and *.html: do not edit. Edit the component folder and run the build.\n// Static, hand-maintained parts (kinds, breakpoints, rules) are in gallery.static.js; samples come from their folders.\nexport * from './gallery.static.js';\n\nexport const CONTROLS = ${JSON.stringify(controls, null, 4)};\n\nexport const TEMPLATES = ${JSON.stringify(samples.templates, null, 4)};\n\nexport const PATTERNS = ${JSON.stringify(samples.patterns, null, 4)};\n\nexport const LAYOUTS = ${JSON.stringify(samples.layouts, null, 4)};\n\nexport const ELEMENTS = ${JSON.stringify(elements.map(e => e.meta), null, 4)};\n\n${paramsRegion}\n`);

    // dist
    const tokens = read(path.join(root, 'tokens', 'tokens.css')); const base = read(path.join(root, 'base', 'base.css')); const a11y = read(path.join(root, 'base', 'a11y.css'));
    const all = [tokens, base, ...comps.filter(c => c.css !== null).map(c => c.css), a11y].join('\n');
    const pageLevel = new Set(['utilities', 'spacing', 'typography', 'table-content']);
    const primary = [tokens, base, ...comps.filter(c => pageLevel.has(c.name) && c.css !== null).map(c => c.css), foucRule, a11y].join('\n');
    const compat = [...comps.filter(c => !pageLevel.has(c.name) && c.css !== null).map(c => c.css), a11y].join('\n'); // a11y last, so it still wins over the rules loaded after the page layer
    w('dist/plainkit.css', `/* GENERATED by tools/build.mjs: tokens, page-level base and utilities for the light DOM. Components are custom elements, loaded on demand by plainkit.js. */\n${primary}`);
    w('dist/plainkit.min.css', minify(primary) + '\n');
    w('dist/plainkit-compat.css', `/* GENERATED by tools/build.mjs: the class-based components, kept only until the Blazor wrappers use the pk-* elements. Nothing new is added here. */\n${compat}`);
    w('dist/plainkit-compat.min.css', minify(compat) + '\n');
    for (const el of elements) w(`dist/elements/${el.name}.js`, elementModule(el, { coreImport: '../js/element.js', minifyCss: true }));
    w('dist/elements/registry.js', `// GENERATED by tools/build.mjs: tag -> module, relative to this file.\nexport default ${JSON.stringify(Object.fromEntries(elements.map(e => [e.meta.tag, `./${e.name}.js`])), null, 4)};\n`);
    for (const [name, text] of Object.entries(allManifests(elements.map(e => e.meta)))) w(`dist/${name}`, text);
    w('dist/elements/api.json', JSON.stringify(elements.map(e => e.meta), null, 2) + '\n');
    for (const c of comps) {
        if (c.css !== null) w(`dist/components/${c.name}/${c.name}.css`, c.css);
        if (c.js !== null) w(`dist/components/${c.name}/${c.name}.js`, c.js);
        w(`dist/components/${c.name}/${c.name}.html`, c.html);
    }
    for (const f of fs.readdirSync(path.join(root, 'js'), { recursive: true })) {
        const src = path.join(root, 'js', f);
        if (fs.statSync(src).isFile() && f.endsWith('.js')) w(`dist/js/${f.replace(/\\/g, '/')}`, read(src).replace("'../site/gallery/embed.html'", "'../gallery/embed.html'")); // in dist the gallery sits next to js/, not under site/
    }
    w('dist/icons.svg', read(path.join(root, 'icons.svg')));
    for (const [f, text] of galleryDist(read, root, out.get('site/gallery/gallery.data.js'))) w(`dist/gallery/${f}`, text);
    for (const [f, text] of modulesDist(read, root)) w(`dist/${f}`, text);
    w('dist/plainkit.js', '// GENERATED by tools/build.mjs: one import wires every behaviour; per-component modules are in components/<name>/.\nexport * from \'./js/plainkit.js\';\n');
    // Supply-chain manifest: every dist file with its size and SRI hash. Deterministic (sorted, no timestamps) so a rebuild of the same
    // sources is byte-identical; consumers pin integrity="sha384-..." from here. The SDK has no runtime dependencies.
    const files = [...out.keys()].filter(f => f.startsWith('dist/')).sort().map(f => { const data = Buffer.from(out.get(f)); return { path: f.slice(5), bytes: data.length, integrity: 'sha384-' + crypto.createHash('sha384').update(data).digest('base64') }; });
    w('dist/manifest.json', JSON.stringify({ name: 'plainkit', dependencies: [], runtimeRequests: 'none (same-origin only)', licence: 'MIT', provenance: 'Generated by sdk/tools/build.mjs from the component folders; reproducible.', files }, null, 2) + '\n');
    return { out, components: comps.length, controls: controls.length, cssKb: Math.round(Buffer.byteLength(all) / 102.4) / 10 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const { out: _o, ...summary } = build(); console.log(summary); }
