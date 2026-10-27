// The custom SDK export, end to end in the browser: fetch the shipped dist files (same origin only), check each against the release manifest, customise them
// (js/custom-sdk-logic.js), and write a store-only zip (js/zip-store.js). No server, no dependency, no request to another origin.
//
//   const dist = await fetchDist(new URL('../', import.meta.url), { onprogress: (done, total) => {} });   // { version, files: Map path -> bytes, report }
//   const { zip, name, summary } = await exportSdk({ dist, include: { theme: true, breakpoints: true }, breakpoints: { phone: 700, tablet: 1024, wide: 1280 }, theme: { overrides, css } });
//   const only = await exportTheme({ version, theme: { overrides, css } });   // theme only: no dist is fetched
import { buildBundle, themeBundle, integrityOf } from './custom-sdk-logic.js';
import { zipStore } from './zip-store.js';
import { createLogger } from './log.js';
const log = createLogger('custom-sdk');
const dec = new TextDecoder();

// A path the manifest lists must stay inside the folder it was fetched from.
const safe = p => typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.includes('\\') && !p.includes(':') && !p.split('/').some(s => s === '..' || s === '.' || s === '');

/**
 * Reads dist/manifest.json (and dist/manifest.extras.json when there is one) under `base` (a URL of the dist folder, ending in a slash) and every file it lists, with `concurrency` requests at a time; each file's SRI hash must equal
 * the manifest's, so a truncated or substituted file is refused. The files are the release the page itself runs from. Throws with the path on the first failure.
 * The dev-tool modules are their own unit with their own manifest (modules/manifest.json, under `modulesBase`, default modules/ next to the runtime): when it is there its files are
 * read and verified the same way and appear in the map as modules/<path>; when the server has none (the modules are not deployed) the runtime alone is fetched.
 */
export async function fetchDist(base, { fetchImpl = globalThis.fetch.bind(globalThis), onprogress, concurrency = 8, modulesBase } = {}) {
    const root = new URL(base, globalThis.location?.href);
    const modulesRoot = new URL(modulesBase ?? 'modules/', root);
    const get = async (from, path) => { const r = await fetchImpl(new URL(path, from).href); if (!r.ok) throw Object.assign(new Error(`${path}: ${r.status}`), { status: r.status }); return new Uint8Array(await r.arrayBuffer()); };
    const readManifest = async (from, prefix, optional, name = 'manifest.json') => {
        let bytes;
        try { bytes = await get(from, name); } catch (e) { if (optional && e.status === 404) return null; throw e; }
        const manifest = JSON.parse(dec.decode(bytes));
        if (!Array.isArray(manifest.files) || !manifest.version) throw new Error(`${prefix}${name} is not a Plainkit manifest`);
        for (const f of manifest.files) if (!safe(f.path)) throw new Error(`the manifest lists an unsafe path: ${f.path}`);
        return { from, prefix, bytes, manifest, name };
    };
    // The extras manifest (the files the npm package leaves out, same folder) is there on the Pages site and in the release zip, not in the npm package.
    const units = [await readManifest(root, '', false), await readManifest(root, '', true, 'manifest.extras.json'), await readManifest(modulesRoot, 'modules/', true)].filter(Boolean);
    const runtime = units[0].manifest;
    for (const u of units) if (u.manifest.version !== runtime.version) throw new Error(`${u.prefix}${u.name} is release ${u.manifest.version} but the runtime is ${runtime.version}`);
    const files = new Map(units.map(u => [u.prefix + u.name, u.bytes]));
    const queue = units.flatMap(u => u.manifest.files.filter(f => f.path !== u.name).map(f => ({ ...f, from: u.from, key: u.prefix + f.path })));
    const total = queue.length + units.length;
    let done = units.length;
    async function worker() {
        for (let f = queue.shift(); f; f = queue.shift()) {
            const bytes = await get(f.from, f.path);
            if (bytes.length !== f.bytes || (await integrityOf(bytes)) !== f.integrity) throw new Error(`${f.key}: does not match its hash in its manifest (a different release, or the file was changed)`);
            files.set(f.key, bytes);
            onprogress?.(++done, total);
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    log.debug('fetched the dist', { version: runtime.version, files: files.size, units: units.length });
    if (!files.has('breakpoints.report.json')) log.warn('breakpoints.report.json is not there (it ships with the plainkit.tools package): the export skips the breakpoints step');
    return { version: runtime.version, files, report: files.has('breakpoints.report.json') ? JSON.parse(dec.decode(files.get('breakpoints.report.json'))) : null };
}

const toZip = files => zipStore([...files].map(([path, data]) => ({ path, data })));

/** The zip of a bundle that carries the dist: { zip, name, summary }. `include` is { theme, breakpoints }; each is used only when included. */
export async function exportSdk({ dist, include, breakpoints, theme }) {
    const { files, summary } = await buildBundle(dist.files, { include, breakpoints, theme });
    return { zip: toZip(files), name: `plainkit-custom-${dist.version}.zip`, summary };
}

/** The zip of a theme-only export: plainkit-theme.css, the settings and a README; nothing of the SDK is fetched or changed. */
export function exportTheme({ version, theme, shipped }) {
    const files = themeBundle({ version, theme, shipped });
    return { zip: toZip(files), name: `plainkit-theme-${version}.zip`, css: dec.decode(files.get('plainkit-theme.css')) };
}
