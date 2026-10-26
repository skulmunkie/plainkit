// Per-page bundle: node core/tools/bundle-page.mjs --elements pk-button,pk-input | --html page.html [--app] [--dist core/dist] --out dir
// Bundles the SDK's shared core and exactly the element modules a page uses into one minified ES module (plainkit.bundle.js) and copies the
// light-DOM stylesheet as ONE css file (plainkit.bundle.css: tokens, base and the elements' FOUC guards; each element's own CSS is inside its module).
// Code the elements load on demand (a table's editing, column resize, the log toast output...) stays lazy: esbuild code splitting writes it, and the code
// the entry and those chunks share, to chunks/ next to the bundle, and only the entry's static imports load with the page. A page then makes about
// 9 requests instead of 20 to 27, and none of the lazy code is downloaded until it is used. Dev/build tool: it needs esbuild (a devDependency of this repository, not of the published
// package), so run it from a checkout, or `npm i -D esbuild` next to your project and point --dist at node_modules/plainkit/dist.
// --flat (#1808): every file in ONE folder with a plainkit prefix (plainkit-<chunk>-<hash>.js, plainkit-icons.svg; no chunks/ folder) and the sprite address rewritten to sit beside the bundle, for a host that serves a flat folder (Shopify theme assets).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The pk-* tag names opened in an HTML text. Pure.
export function tagsInHtml(html) {
    return [...new Set([...html.matchAll(/<(pk-[a-z0-9]+(?:-[a-z0-9]+)*)(?=[\s/>])/gi)].map(m => m[1].toLowerCase()))].sort();
}

export const sizes = data => ({ raw: Buffer.byteLength(data), gzip: zlib.gzipSync(data, { level: 9 }).length, brotli: zlib.brotliCompressSync(data).length });

// The entry source for a module list: the page layer and loader re-exports, every element module, optionally the app framework.
export function entrySource(modules, { app = false, full = false } = {}) {
    return [`export * from "./js/${full ? "plainkit" : "init"}.js";`, ...(app ? ['export * from "./js/app.js";'] : []), ...modules.map(m => `import ${JSON.stringify('./elements/' + m)};`)].join('\n') + '\n';
}

const registryOf = async dist => (await import(pathToFileURL(path.join(dist, 'elements', 'registry.js')).href)).default;

// --flat: the dist literals that address a file one folder up, and what they become beside the bundle. A literal that is gone fails the build with a FIX line, so a source change cannot silently break a flat bundle.
export const FLAT_REWRITES = { 'icon-sprite.js': [/(["'])\.\.\/icons\.svg\1/, '"./plainkit-icons.svg"'] };
const flatPlugin = () => ({ name: 'plainkit-flat', setup(b) {
    b.onLoad({ filter: /[\\/]js[\\/][\w-]+\.js$/ }, args => {
        const rule = FLAT_REWRITES[path.basename(args.path)];
        if (!rule) return undefined;
        const code = fs.readFileSync(args.path, 'utf8');
        if (!rule[0].test(code)) throw new Error(`--flat: ${args.path} no longer holds ${rule[0]}. FIX: update FLAT_REWRITES in core/tools/bundle-page.mjs to the new address.`);
        return { contents: code.replace(rule[0], rule[1]), loader: 'js' };
    });
} });

export async function bundlePage({ tags, dist, out, app = false, full = false, flat = false }) {
    let esbuild;
    try { esbuild = await import('esbuild'); } catch (error) { throw new Error(`esbuild is not installed (${error.message}). FIX: run npm ci in the repository, or npm i -D esbuild in your project.`); }
    const registry = await registryOf(dist);
    const unknown = tags.filter(t => !registry[t]);
    if (unknown.length) throw new Error(`not Plainkit elements: ${unknown.join(', ')}. FIX: check the spelling against dist/elements/registry.js.`);
    const modules = [...new Set(tags.map(t => registry[t].replace(/^\.\//, '')))];
    const res = await esbuild.build({
        stdin: { contents: entrySource(modules, { app, full }), resolveDir: dist, sourcefile: 'plainkit-page.js' },
        bundle: true, format: 'esm', minify: true, write: false, legalComments: 'none', target: 'es2022', treeShaking: true,
        splitting: true, outdir: out, entryNames: 'plainkit.bundle', chunkNames: flat ? 'plainkit-[name]-[hash]' : 'chunks/[name]-[hash]', metafile: true, plugins: flat ? [flatPlugin()] : [],
    });
    const css = fs.readFileSync(path.join(dist, 'plainkit.min.css'), 'utf8');
    // The files that load with the page: the entry and, transitively, the chunks it imports statically. The rest are lazy.
    const rel = f => path.relative(out, f).replaceAll('\\', '/'), byRel = new Map(res.outputFiles.map(f => [rel(f.path), f]));
    const meta = Object.fromEntries(Object.entries(res.metafile.outputs).map(([k, v]) => [rel(path.resolve(k)), v]));
    const initial = new Set(), walk = f => { if (initial.has(f)) return; initial.add(f); for (const i of meta[f].imports) if (i.kind === 'import-statement') walk(rel(path.resolve(i.path))); };
    walk('plainkit.bundle.js');
    // Sizes are the sum of each file compressed on its own, as a server sends them.
    const sum = names => names.reduce((t, n) => { const s = sizes(Buffer.from(byRel.get(n).contents)); return { raw: t.raw + s.raw, gzip: t.gzip + s.gzip, brotli: t.brotli + s.brotli }; }, { raw: 0, gzip: 0, brotli: 0 });
    for (const f of res.outputFiles) { fs.mkdirSync(path.dirname(f.path), { recursive: true }); fs.writeFileSync(f.path, f.contents); }
    fs.writeFileSync(path.join(out, 'plainkit.bundle.css'), css);
    if (flat) fs.copyFileSync(path.join(dist, 'icons.svg'), path.join(out, 'plainkit-icons.svg'));
    const lazy = [...byRel.keys()].filter(n => !initial.has(n)).sort();
    return { tags, modules, js: sum([...initial]), lazy: sum(lazy), css: sizes(css), initial: [...initial].sort(), lazyFiles: lazy, files: ['plainkit.bundle.css', ...(flat ? ['plainkit-icons.svg'] : []), ...initial, ...lazy] };
}

// The unbundled cost: the static import graph of the same entry (files, summed per-file sizes), plus the registry the loader fetches.
export async function unbundledGraph({ tags, dist, app = false, full = false }) {
    const registry = await registryOf(dist);
    const seen = new Set();
    const walk = f => {
        if (seen.has(f) || !fs.existsSync(f)) return;
        seen.add(f);
        for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.[^"']+)["']/g)) walk(path.resolve(path.dirname(f), m[1]));
    };
    walk(path.join(dist, 'js', full ? 'plainkit.js' : 'init.js'));
    if (app) walk(path.join(dist, 'js', 'app.js'));
    walk(path.join(dist, 'elements', 'registry.js'));
    for (const t of tags) walk(path.join(dist, 'elements', registry[t]));
    let raw = 0, gzip = 0, brotli = 0;
    for (const f of seen) { const s = sizes(fs.readFileSync(f)); raw += s.raw; gzip += s.gzip; brotli += s.brotli; }
    return { files: seen.size, raw, gzip, brotli };
}

function parse(argv) {
    const o = { elements: [], html: [], app: false, full: false, flat: false, dist: path.join(here, '..', 'dist'), out: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i], v = () => argv[++i];
        if (a === '--elements') o.elements.push(...v().split(',').map(s => s.trim()).filter(Boolean));
        else if (a === '--html') o.html.push(v());
        else if (a === '--app') o.app = true;
        else if (a === '--full') o.full = true;
        else if (a === '--flat') o.flat = true;
        else if (a === '--dist') o.dist = path.resolve(v());
        else if (a === '--out') o.out = path.resolve(v());
        else throw new Error(`unknown argument ${a}. Usage: bundle-page.mjs (--elements pk-a,pk-b | --html page.html) [--app] [--full] [--flat] [--dist dir] --out dir`);
    }
    return o;
}

const kb = n => (n / 1024).toFixed(1) + ' KB';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const o = parse(process.argv.slice(2));
        const tags = [...new Set([...o.elements, ...o.html.flatMap(f => tagsInHtml(fs.readFileSync(f, 'utf8')))])].sort();
        if (!o.out || !tags.length) throw new Error('give --out and at least one element (--elements pk-button, or --html page.html with pk-* tags).');
        const r = await bundlePage({ tags, dist: o.dist, out: o.out, app: o.app, full: o.full, flat: o.flat });
        const u = await unbundledGraph({ tags, dist: o.dist, app: o.app, full: o.full });
        console.log(`bundled ${tags.join(', ')} -> ${path.join(o.out, 'plainkit.bundle.js')} + .css (+ ${o.flat ? 'plainkit-*.js and plainkit-icons.svg beside it' : './chunks/*'}: ${r.initial.length} js files load with the page, ${r.lazyFiles.length} on demand; unbundled js is ${u.files} files)`);
        console.log(`js   raw ${kb(r.js.raw)}  gzip ${kb(r.js.gzip)}  brotli ${kb(r.js.brotli)}   (unbundled: raw ${kb(u.raw)}, gzip ${kb(u.gzip)}, brotli ${kb(u.brotli)}); lazy, not loaded with the page: gzip ${kb(r.lazy.gzip)}`);
        console.log(`css  raw ${kb(r.css.raw)}  gzip ${kb(r.css.gzip)}  brotli ${kb(r.css.brotli)}`);
        console.log(`Load it with <link rel="stylesheet" href="plainkit.bundle.css"> and <script type="module" src="plainkit.bundle.js"></script>; ${o.flat ? 'publish every plainkit-* file in the same folder.' : 'publish chunks/ next to it.'}`);
    } catch (error) { console.error(error.message); process.exit(1); }
}
