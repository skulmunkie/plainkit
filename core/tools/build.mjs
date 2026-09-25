// SDK build: node core/tools/build.mjs   (dependency-free, deterministic; run it after editing any source folder)
//
// The page layer is tokens/ and base/ (base.css, spacing, typography, table-content, utilities, a11y); everything else is a custom element in
// elements/<name>/: <name>.html (template), <name>.css, <name>.js (behaviour, optional), <name>.meta.json (the API). This script generates,
// and you never hand-edit:
//   plainkit.css                     @imports the page layer in cascade order, then the element FOUC guard, then a11y
//   site/gallery/gallery.data.js     the gallery's data: the sample folders and the element API assembled (+ gallery.static.js)
//   site/guides/guides.data.js       the Guides page's content: site/guides/content/*.md converted to sanitised HTML (tools/guides.mjs)
//   site/files/snapshot.json         the Files page's snapshot of core/ (no timestamp; it holds every file above, never itself)
//   dist/plainkit.css, dist/plainkit.min.css, dist/plainkit.js, dist/js/, dist/elements/   the runtime SDK: what a non-Blazor project consumes (manifest: dist/manifest.json)
//   dist/modules/<tool>/             the dev-tool modules (code-explorer, ...) from modules/: a unit of their own, with dist/modules/manifest.json (tools/modules-dist.mjs);
//                                    the runtime manifest lists nothing under modules/, and each unit is zipped and hashed on its own

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateApi, propsObject, deprecationSpec } from './element-api.mjs';
import { allManifests } from './element-manifests.mjs';
import { galleryDist } from './gallery-dist.mjs';
import { modulesDist, MODULES, MODULES_DIR } from './modules-dist.mjs';
import { surface } from './api-surface.mjs';
import { collectSnapshot, collectFileList } from './snapshot.mjs';
import { guidesModule } from './guides.mjs';
import { loadBreakpoints, resolveCustomMedia, breakpointProperties } from './breakpoints.mjs';
import { manifestText, modulesRequires } from '../js/custom-sdk-logic.js';
import { reportJson as breakpointReport } from './breakpoint-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Every generated file goes through w(): kept in `out` (path -> exact text) and written to disk only when build({ write: true }) (the
// default). A test builds with write: false and compares `out` to the files on disk, so it never rewrites files other tests read.
let out = new Map();
let writing = true;
const w = (rel, text) => { const crlf = text.replace(/\r?\n/g, '\r\n'); out.set(rel, crlf); if (!writing) return; const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crlf); };
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// Samples live in their own folders, each with a meta file: samples/templates/<id>/, samples/patterns/<id>/ and layouts/<id>/.
// The meta lists the elements the sample uses (a test keeps that list equal to what its markup carries).
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
            // A pattern may ship a script beside its markup (<id>.js: export default mount(root) -> { destroy() }); the data names it relative to the patterns folder.
            const script = group === 'patterns' && fs.existsSync(path.join(base, e.name, `${e.name}.js`)) ? { script: `${e.name}/${e.name}.js` } : {};
            list.push({ ...meta, ...(group === 'templates' ? {} : { html: read(htmlFile).trim() }), ...script, file: `${dir}/${e.name}/${e.name}.html` });
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
    const problems = []; const list = []; const bps = loadBreakpoints();
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
        const f = ext => path.join(dir, e.name, `${e.name}.${ext}`);
        for (const need of ['html', 'css', 'meta.json']) if (!fs.existsSync(f(need))) problems.push(`elements/${e.name} is missing ${e.name}.${need}`);
        if (problems.length) continue;
        const meta = JSON.parse(read(f('meta.json'))); const template = read(f('html')).trim(); const css = read(f('css'));
        const behaviour = fs.existsSync(f('js')) ? read(f('js')) : null;
        problems.push(...validateApi(meta, { template, css, name: `elements/${e.name}` }));
        if (meta.tag !== `pk-${e.name}`) problems.push(`elements/${e.name}: tag must be pk-${e.name}`);
        // Element CSS names its breakpoints (@media (--phone)); the module gets the real queries (tools/breakpoints.mjs). An unknown name fails the build here.
        list.push({ name: e.name, meta, template, css: resolveCustomMedia(css, bps, `elements/${e.name}/${e.name}.css`), behaviour });
    }
    if (problems.length) throw new Error(problems.join('\n'));
    return list;
}

export function elementModule(el, { coreImport, minifyCss = false }) {
    // A behaviour file imports shared modules as '../../js/x.js' (its source location; a static import or a lazy import('../../js/x.js')); the generated module lives elsewhere in dist.
    const jsBase = coreImport.replace(/element\.js$/, '');
    const beh = el.behaviour ? el.behaviour.replace(/^[ \t]*\/\/.*\r?\n/gm, '').replace(/(from '|import\(')\.\.\/\.\.\/js\//g, `$1${jsBase}`).replace(/^export default /m, 'const behaviour = ').trimEnd().replace(/;?$/, ';') : 'const behaviour = Base => Base;';
    const m = el.meta;
    // Only an element that deprecates something imports the helper (js/deprecation.js) and pays for it.
    const spec = deprecationSpec(m);
    const base = spec ? `deprecations(behaviour(PkElement), ${JSON.stringify(spec)})` : 'behaviour(PkElement)';
    return `// GENERATED by tools/build.mjs from elements/${el.name}/: do not edit.
import { PkElement, define } from '${coreImport}';${spec ? `\nimport { deprecations } from '${jsBase}deprecation.js';` : ''}
${beh}
export default define(class extends ${base} {
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

// Files under dist/js that no source in js/ (or a module's own js) produces any more: a rename or a removal leaves the old copy behind, and
// nothing else would ever notice it. Paths are relative to rootDir, with forward slashes; `out` is the build's path -> text map.
const staleUnder = (out, rootDir, sub) => {
    const dir = path.join(rootDir, 'dist', sub);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile())
        .map(e => path.relative(rootDir, path.join(e.parentPath, e.name)).replace(/\\/g, '/'))
        .filter(f => !out.has(f)).sort();
};
export const staleDistJs = (out, rootDir = root) => staleUnder(out, rootDir, 'js');

// The same for the modules unit (dist/modules), and for the folders the modules had before they became a unit (dist/<name>/, next to js/): a checkout that built
// the old layout keeps those otherwise, and the runtime dist must hold no module folder.
export const staleDistModules = (out, rootDir = root) => [...staleUnder(out, rootDir, MODULES_DIR), ...Object.keys(MODULES).flatMap(name => staleUnder(out, rootDir, name))].sort();

// The files under dist/skills on disk, plus the AGENTS.md/llms.txt/llms-full.txt export of them (scripts/build-agent-refs.mjs), as paths
// relative to core with forward slashes (the build does not produce any of these; see the manifest below).
function skillFiles() {
    const dir = path.join(root, 'dist', 'skills');
    const out = fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.relative(root, path.join(e.parentPath, e.name)).replace(/\\/g, '/')) : [];
    for (const name of ['AGENTS.md', 'llms.txt', 'llms-full.txt']) if (fs.existsSync(path.join(root, 'dist', name))) out.push(`dist/${name}`);
    return out;
}

export function build({ write = true } = {}) {
    writing = write; out = new Map();
    const samples = loadSamples();
    const bps = loadBreakpoints();
    const elements = loadElementSources();
    const foucRule = elements.length ? `${elements.map(e => `${e.meta.tag}:not(:defined)`).join(',')}{visibility:hidden}` : '';
    // The page layer, in cascade order: tokens, base, then spacing, typography, table-content and utilities, the element FOUC guard, a11y last.
    const layer = ['spacing', 'typography', 'table-content', 'utilities'];
    w('plainkit.css', `/* GENERATED by tools/build.mjs: do not edit. Entry point for a non-Blazor page. base/a11y.css is last on purpose. */\n@import url("tokens/tokens.css");\n@import url("base/base.css");\n${layer.map(n => `@import url("base/${n}.css");`).join('\n')}\n@import url("elements/elements.css");\n@import url("base/a11y.css");\n${breakpointProperties(bps)}\n`);
    w('elements/elements.css', `/* GENERATED by tools/build.mjs: hides an pk-* element until its module has defined it, so there is no flash of unstyled content. */\n${foucRule}\n`);
    for (const el of elements) w(`elements/${el.name}/${el.name}.element.js`, elementModule(el, { coreImport: '../../js/element.js' }));
    w('elements/registry.js', `// GENERATED by tools/build.mjs: tag -> module, relative to this file. js/loader.js imports only the modules a page uses.\nexport default ${JSON.stringify(Object.fromEntries(elements.map(e => [e.meta.tag, `./${e.name}/${e.name}.element.js`])), null, 4)};\n`);
    // The element index stays in gallery.data.js; each element's full meta (props, events, examples, docs) is its own chunk, imported on demand (issue 282: the one file had outgrown the snapshot's per-file cap).
    for (const el of elements) w(`site/gallery/elements/${el.name}.data.js`, `// GENERATED by tools/build.mjs from ${el.name}.meta.json: do not edit. Loaded on demand by gallery.data.js.
export default ${JSON.stringify(el.meta, null, 4)};
`);
    const elementIndex = elements.map(e => ({ tag: e.meta.tag, name: e.name, title: e.meta.title, group: e.meta.group, summary: e.meta.summary }));
    w('site/gallery/gallery.data.js', `// GENERATED by tools/build.mjs from the sample folders and the element meta files: do not edit. Edit the source folder and run the build.
// Static, hand-maintained parts (breakpoints, text pairs, responsive rules) are in gallery.static.js; samples come from their folders.
// ELEMENTS is the index (tag, name, title, group, summary); an element's full meta is in elements/<name>.data.js: loadElement(tag) or loadAllElements().
export * from './gallery.static.js';

export const TEMPLATES = ${JSON.stringify(samples.templates, null, 4)};

export const PATTERNS = ${JSON.stringify(samples.patterns, null, 4)};

export const LAYOUTS = ${JSON.stringify(samples.layouts, null, 4)};

export const ELEMENTS = ${JSON.stringify(elementIndex, null, 4)};

const loaded = new Map();
export const loadElement = tag => {
    const entry = ELEMENTS.find(e => e.tag === tag);
    if (!entry) return Promise.resolve(undefined);
    if (!loaded.has(tag)) loaded.set(tag, import(\`./elements/\${entry.name}.data.js\`).then(m => m.default));
    return loaded.get(tag);
};
export const loadAllElements = () => Promise.all(ELEMENTS.map(e => loadElement(e.tag)));
`);
    w('site/guides/guides.data.js', guidesModule());

    // dist
    const tokens = read(path.join(root, 'tokens', 'tokens.css')); const base = read(path.join(root, 'base', 'base.css')); const a11y = read(path.join(root, 'base', 'a11y.css'));
    const page = [tokens, breakpointProperties(bps), base, ...layer.map(n => read(path.join(root, 'base', `${n}.css`))), foucRule, a11y].join('\n');
    w('dist/plainkit.css', `/* GENERATED by tools/build.mjs: do not edit. Page layer; components load on demand (plainkit.js). */\n${page}`);
    w('dist/plainkit.min.css', minify(page) + '\n');
    for (const el of elements) w(`dist/elements/${el.name}.js`, elementModule(el, { coreImport: '../js/element.js', minifyCss: true }));
    w('dist/elements/registry.js', `// GENERATED by tools/build.mjs: tag -> module, relative to this file.\nexport default ${JSON.stringify(Object.fromEntries(elements.map(e => [e.meta.tag, `./${e.name}.js`])), null, 4)};\n`);
    for (const [name, text] of Object.entries(allManifests(elements.map(e => e.meta)))) w(`dist/${name}`, text);
    w('dist/elements/api.json', JSON.stringify(elements.map(e => e.meta), null, 2) + '\n');
    // What changes at each named breakpoint (which elements, selectors and properties), from the resolved element CSS and the page layer.
    w('dist/breakpoints.report.json', breakpointReport(elements, root));
    // The version (core/VERSION) is stamped into js/version.js (and its dist copy) and dist/manifest.json, so a file from a CDN, a zip or the
    // NuGet package can say which release it is. tools/versioning.mjs checks every place agrees.
    const version = read(path.join(root, 'VERSION')).trim();
    const versionModule = `// GENERATED by tools/build.mjs from VERSION: do not edit. The Plainkit release this file belongs to.
export const PK_VERSION = '${version}';
`;
    w('js/version.js', versionModule);
    w('dist/js/version.js', versionModule);
    for (const f of fs.readdirSync(path.join(root, 'js'), { recursive: true })) {
        const src = path.join(root, 'js', f);
        // js/code-explorer/*.js only re-export modules/code-explorer for the old import path: a runtime file must not import from the modules unit, so they stay out of dist.
        if (fs.statSync(src).isFile() && f.endsWith('.js') && !/^code-explorer[\\/]/.test(f)) w(`dist/js/${f.replace(/\\/g, '/')}`, read(src).replace("'../site/gallery/embed.html'", "'../gallery/embed.html'")); // in dist the gallery sits next to js/, not under site/
    }
    w('dist/icons.svg', read(path.join(root, 'icons.svg')));
    // The API surface as it is now, for the scorecard's API section to diff against the baseline (kept current by the build, checked by a test).
    w('site/scorecard/api.current.json', JSON.stringify(surface(), null, 1) + '\n');
    for (const [f, text] of galleryDist(read, root, out.get('site/gallery/gallery.data.js'), [...out].filter(([f]) => f.startsWith('site/gallery/elements/')).map(([f, t]) => [f.slice('site/gallery/'.length), t]))) w(`dist/gallery/${f}`, text);
    for (const [f, text] of modulesDist(read, root)) w(`dist/${f}`, text);
    w('dist/plainkit.js', '// GENERATED by tools/build.mjs: one import wires every behaviour.\nexport * from \'./js/plainkit.js\';\n');
    // Supply-chain manifests, one per unit: the runtime (dist/manifest.json) and the modules (dist/modules/manifest.json), each file with its size and SRI hash. Deterministic (sorted, no timestamps) so a rebuild of the same
    // sources is byte-identical; consumers pin integrity="sha384-..." from here. The SDK has no runtime dependencies.
    // dist/skills (the agent skills bundle) and its AGENTS.md/llms.txt/llms-full.txt export are written by scripts/build-skills.mjs and
    // scripts/build-agent-refs.mjs, which need the API this build produces, so the build does not produce them; the manifest lists whatever
    // is on disk there (and each of those scripts rebuilds the manifest after writing).
    const bytesOf = f => (out.has(f) ? Buffer.from(out.get(f)) : fs.readFileSync(path.join(root, f)));
    const unitFiles = (prefix, own) => [...new Set([...out.keys(), ...skillFiles()])].filter(f => f.startsWith(prefix) && own(f)).sort().map(f => { const data = bytesOf(f); return { path: f.slice(prefix.length), bytes: data.length, integrity: 'sha384-' + crypto.createHash('sha384').update(data).digest('base64') }; });
    const modulesPrefix = `dist/${MODULES_DIR}/`;
    const files = unitFiles('dist/', f => !f.startsWith(modulesPrefix) && f !== 'dist/manifest.json');
    const moduleFiles = unitFiles(modulesPrefix, f => f !== `${modulesPrefix}manifest.json`);
    // The build owns dist/js: whatever it did not just produce is a leftover, and is removed so the folder is exactly the sources.
    if (write) {
        for (const f of [...staleDistJs(out), ...staleDistModules(out)]) fs.rmSync(path.join(root, f));
        for (const name of Object.keys(MODULES)) fs.rmSync(path.join(root, 'dist', name), { recursive: true, force: true }); // the old dist/<name>/ folders, now empty
    }
    // The text is js/custom-sdk-logic.js manifestText(), the same function the theme editor's custom SDK export uses to recompute it in the browser.
    w('dist/manifest.json', manifestText({ version, files }));
    w(`${modulesPrefix}manifest.json`, manifestText({ version, files: moduleFiles, name: 'plainkit-modules', requires: modulesRequires(version) }));
    // The Files page's snapshot of core/ itself. Written last, from the files on disk with everything generated above laid over them (so a stale
    // generated file never leaks in), no timestamp (deterministic). It skips its own file and dist/, so it never includes itself.
    const snapshotOverlay = new Map([...out].filter(([f]) => !f.startsWith('dist/')));
    w('site/files/snapshot.json', JSON.stringify(collectSnapshot(root, { generated: null, overlay: snapshotOverlay })));
    // The lean file list the live Files page fetches by default (issue 196): path, language and line count only, no content --
    // each file's own text comes same-origin, on demand, from the Pages deploy's copy of core/ (build-pages.mjs's FULL folders).
    w('site/files/index.json', JSON.stringify(collectFileList(root, { overlay: snapshotOverlay })));
    return { out, elements: elements.length, samples: Object.values(samples).reduce((n, g) => n + g.length, 0), pageCssKb: Math.round(Buffer.byteLength(page) / 102.4) / 10 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const { out: _o, ...summary } = build(); console.log(summary); }
