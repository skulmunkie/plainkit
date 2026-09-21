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
 * Reads dist/manifest.json under `base` (a URL of the dist folder, ending in a slash) and every file it lists, with `concurrency` requests at a time; each file's SRI hash must equal
 * the manifest's, so a truncated or substituted file is refused. The files are the release the page itself runs from. Throws with the path on the first failure.
 */
export async function fetchDist(base, { fetchImpl = globalThis.fetch.bind(globalThis), onprogress, concurrency = 8 } = {}) {
    const root = new URL(base, globalThis.location?.href);
    const get = async path => { const r = await fetchImpl(new URL(path, root).href); if (!r.ok) throw new Error(`${path}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
    const manifestBytes = await get('manifest.json');
    const manifest = JSON.parse(dec.decode(manifestBytes));
    if (!Array.isArray(manifest.files) || !manifest.version) throw new Error('manifest.json is not a Plainkit manifest');
    const files = new Map([['manifest.json', manifestBytes]]);
    const queue = manifest.files.filter(f => f.path !== 'manifest.json');
    for (const f of queue) if (!safe(f.path)) throw new Error(`the manifest lists an unsafe path: ${f.path}`);
    let done = 0;
    async function worker() {
        for (let f = queue.shift(); f; f = queue.shift()) {
            const bytes = await get(f.path);
            if (bytes.length !== f.bytes || (await integrityOf(bytes)) !== f.integrity) throw new Error(`${f.path}: does not match its hash in manifest.json (a different release, or the file was changed)`);
            files.set(f.path, bytes);
            onprogress?.(++done, manifest.files.length);
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    log.debug('fetched the dist', { version: manifest.version, files: files.size });
    return { version: manifest.version, files, report: files.has('breakpoints.report.json') ? JSON.parse(dec.decode(files.get('breakpoints.report.json'))) : null };
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
