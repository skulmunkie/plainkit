// The opt-in cache of `node scripts/ui-review.mjs --cache` (issue #749): a unit of work (one element's gallery examples, or one scenario, in one viewport and theme) is
// rendered once per distinct set of inputs. Its key is a hash of EVERYTHING that can reach the page: the render-wide sources (core/js, tokens, base, layouts, icons, the
// review harness, the gallery frame, the runner itself), the unit's own files (the element folders it loads, transitively, and their gallery data; for a scenario the file
// and its static import closure), the viewport, the theme and the browser's version string. A hit restores the PNGs and the findings; a miss renders and stores. Never used in CI.
// Rule: hash too much, not too little. What cannot be enumerated (a tag built at run time, a scenario importing modules or samples) widens the unit to every element.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listElementFolders } from '../core/tools/element-folders.mjs';

const sha = data => createHash('sha256').update(data).digest('hex');
const SKIP_FILE = /\.test\.mjs$/;
const TAG = /\bpk-[a-z][a-z0-9-]*/g;
// A tag name assembled at run time cannot be listed: such an element is treated as using every element.
const DYNAMIC_TAG = /['"`]pk-['"`]\s*\+|pk-\$\{/;

/** The element names (without `pk-`) a text mentions, restricted to `known`. Pure. */
export const tagsIn = (text, known) => [...new Set((text.match(TAG) ?? []).map(t => t.slice(3)).filter(n => known.has(n)))].sort();

/** The relative module specifiers a script imports (`from './x'`, `import './x'`, `import('./x')`). Pure. */
export const importsOf = text => [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1]);

/** The elements an element needs, transitively: `uses` is { name: [names it mentions] }, `dynamic` a Set of names that build tags at run time (they need everything). Pure. */
export function closureOf(names, uses, dynamic, known) {
    const seen = new Set();
    const queue = [...names];
    while (queue.length) {
        const n = queue.pop();
        if (seen.has(n)) continue;
        seen.add(n);
        if (dynamic.has(n)) return [...known].sort();
        queue.push(...(uses[n] ?? []));
    }
    return [...seen].sort();
}

/** The key of one unit: the same inputs give the same key, any changed input another. Pure. */
export const unitKey = parts => sha(JSON.stringify(parts));

/** Files under `dir` (recursive, sorted) except tests and what `skip(relative path)` names. */
function walk(dir, skip = () => false, base = dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
        const p = path.join(dir, d.name), rel = path.relative(base, p).replace(/\\/g, '/');
        if (skip(rel, d.isDirectory())) return [];
        return d.isDirectory() ? walk(p, skip, base) : SKIP_FILE.test(d.name) ? [] : [p];
    }).sort();
}

export function createCache({ root, dir, chrome, known }) {
    const hashed = new Map();
    const fileHash = f => { if (!hashed.has(f)) hashed.set(f, sha(fs.readFileSync(f))); return hashed.get(f); };
    const treeHash = files => sha(files.map(f => `${path.relative(root, f).replace(/\\/g, '/')}\0${fileHash(f)}`).join('\n'));
    const at = (...p) => path.join(root, ...p);
    const gallerySkip = (rel, isDir) => rel === 'gallery.data.js' || (isDir && rel === 'elements');
    const sitePart = rel => ['gallery/gallery.data.js', 'gallery/elements', 'files/snapshot.json'].includes(rel);
    const globalFiles = [
        ...['js', 'tokens', 'base', 'layouts', 'icons'].flatMap(d => walk(at('core', d))),
        ...walk(at('core', 'tests', 'review'), (rel, isDir) => isDir && rel === 'scenarios'),
        ...walk(at('core', 'site', 'gallery'), gallerySkip),
        ...['core/plainkit.css', 'core/elements/elements.css', 'core/elements/registry.js', 'core/tools/serve.mjs', 'scripts/ui-review.mjs', 'scripts/ui-review-cache.mjs', 'scripts/attest-browser.mjs'].map(f => at(f)).filter(fs.existsSync),
    ];
    const global = () => treeHash(globalFiles);
    const folders = new Map(listElementFolders(path.join(root, 'core')).map(e => [e.name, e.dir]));
    const filesOf = name => [...walk(folders.get(name)), ...[at('core', 'site', 'gallery', 'elements', `${name}.data.js`)].filter(fs.existsSync)];
    const text = f => fs.readFileSync(f, 'utf8');
    const uses = {}, dynamic = new Set();
    for (const name of folders.keys()) {
        uses[name] = [];
        for (const f of filesOf(name)) { const t = text(f); uses[name].push(...tagsIn(t, known)); if (DYNAMIC_TAG.test(t)) dynamic.add(name); }
    }
    const elementsHash = names => sha(names.map(n => treeHash(filesOf(n))).join('\n'));

    // A scenario's own files: itself and every relative import, transitively. One that reaches core/modules or core/samples (their pages, fetched data and tags are not listed here) takes all of core/modules, core/samples,
    // core/site and every element.
    function scenarioInputs(sc) {
        const file = at('core', 'tests', 'review', 'scenarios', `${sc.name}.js`);
        const seen = new Set(), queue = [file], tags = new Set(sc.elements ?? []);
        let wide = false;
        while (queue.length) {
            const f = queue.pop();
            if (seen.has(f) || !fs.existsSync(f)) continue;
            seen.add(f);
            const t = text(f);
            for (const n of tagsIn(t, known)) tags.add(n);
            if (/snapshot\.json/.test(t)) seen.add(at('core', 'site', 'files', 'snapshot.json'));
            if (/^core\/(modules|samples)\//.test(path.relative(root, f).replace(/\\/g, '/'))) wide = true;
            if (f.endsWith('.js')) for (const spec of importsOf(t)) queue.push(path.resolve(path.dirname(f), spec.endsWith('.js') || path.extname(spec) ? spec : `${spec}.js`));
        }
        const extra = wide ? [...walk(at('core', 'modules')), ...walk(at('core', 'samples')), ...walk(at('core', 'site'), sitePart)] : [];
        const names = wide ? [...known].sort() : closureOf([...tags], uses, dynamic, known);
        return { own: treeHash([...seen].filter(fs.existsSync).sort().concat(extra)), elements: elementsHash(names) };
    }

    const stats = { hits: 0, misses: 0, corrupt: 0 };
    const entryDir = key => path.join(dir, key);

    function restore(key, out) {
        const d = entryDir(key), meta = path.join(d, 'entry.json');
        if (!fs.existsSync(meta)) return null;
        try {
            const entry = JSON.parse(fs.readFileSync(meta, 'utf8'));
            for (const [f, h] of Object.entries(entry.files)) if (sha(fs.readFileSync(path.join(d, f))) !== h) throw new Error(`${f} does not match its recorded hash`);
            for (const f of Object.keys(entry.files)) fs.copyFileSync(path.join(d, f), path.join(out, f));
            return entry.shots;
        } catch (e) {
            console.error(`cache entry ${key.slice(0, 12)} is corrupt (${e.message}): rendering it again`);
            stats.corrupt++;
            fs.rmSync(d, { recursive: true, force: true });
            return null;
        }
    }

    function store(key, shots, out) {
        const tmp = `${entryDir(key)}.tmp-${process.pid}`;
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.mkdirSync(tmp, { recursive: true });
        const files = {};
        for (const f of new Set(shots.map(s => s.file).filter(Boolean))) { fs.copyFileSync(path.join(out, f), path.join(tmp, f)); files[f] = fileHash(path.join(tmp, f)); }
        fs.writeFileSync(path.join(tmp, 'entry.json'), JSON.stringify({ shots, files }));
        // Windows can hold a just-written folder for a moment (an indexer, a scanner): retry, then say so and go on, as the cache only saves time and the shots are already rendered.
        for (let attempt = 1; ; attempt++) {
            try { fs.rmSync(entryDir(key), { recursive: true, force: true }); fs.renameSync(tmp, entryDir(key)); return; } catch (e) {
                if (attempt < 8) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * attempt); continue; }
                console.error(`cache: could not store ${key.slice(0, 12)} (${e.message}); this unit will be rendered again next time`);
                fs.rmSync(tmp, { recursive: true, force: true });
                return;
            }
        }
    }

    /** Runs `render()` for a unit unless a verified entry for its key exists, in which case its shots are restored into `manifest` and `out`. A unit that could not be seen is never stored. */
    const keyFor = ({ kind, name, sc, vp, theme }) => unitKey({ g: global(), chrome, kind, name, vp, theme, flags: process.env.PK_CHROME_FLAGS ?? '', ...(sc ? scenarioInputs(sc) : { elements: elementsHash(closureOf([name], uses, dynamic, known)) }) });
    async function unit(u, { manifest, out }, render) {
        const key = keyFor(u);
        const cached = restore(key, out);
        if (cached) { manifest.shots.push(...cached); stats.hits++; return; }
        const s0 = manifest.shots.length, n0 = manifest.notSeen.length;
        await render();
        stats.misses++;
        // Only a clean unit is kept: one that could not be seen, or that shows an error, is rendered again next time (an error may be a flake, and must never outlive the fix).
        if (manifest.notSeen.length === n0 && !manifest.shots.slice(s0).some(s => s.findings.some(f => f.severity === 'error'))) store(key, manifest.shots.slice(s0), out);
    }
    return { unit, keyFor, stats };
}
