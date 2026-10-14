// The custom SDK: the pure logic behind "Export custom SDK" in the theme editor (modules/theme-editor) and behind the build's own breakpoint and manifest
// steps, so one implementation is tested. No DOM, no network, no dependencies: text and bytes in, text and bytes out (SubtleCrypto for the hashes).
//
// Two independent inputs. A THEME (token overrides) and BREAKPOINTS (the widths of phone, tablet and wide); either can be exported alone or both together:
//   theme only         themeBundle()  -> plainkit-theme.css (loads after plainkit.css) + plainkit.custom.json + README.md; touches no SDK file
//   breakpoints only   buildBundle()  -> the shipped dist with the widths rewritten, a recomputed manifest, settings and README
//   both               buildBundle()  -> the same, with the theme also baked into plainkit.css and plainkit.min.css
// Nothing is executed or injected as markup: the transforms are text replacements checked by count, and the theme CSS is re-validated name by name and value by value.
//
// Breakpoints: element CSS names a width (tools/breakpoints.mjs resolves (--phone) to (max-width: 640px) and (--above-phone) to (min-width: 641px) at build time), so
// the built files hold literal queries. rewriteMedia() replaces exactly those widths, in @media conditions only, in a single pass (so phone 640 -> 1024 with tablet
// 1024 -> 1500 cannot chain), and the --pk-bp-* block on :root (read by js/breakpoints.js) follows. The "from" widths are read from the files being exported
// (readShippedBreakpoints), so a bundle can itself be customised again.
import { nameProblem, valueProblem, sanitizeOverrides } from './theme.js';
import { readShippedBreakpoints, sameWidths, rewriteMedia, rewriteProperties, reportWithWidths } from './custom-sdk-breakpoints.js';
import { SETTINGS_NAME, settingsText, readmeText, manifestText, integrityOf } from './custom-sdk-files.js';

// The pieces moved out to keep every module under the gzip budget (#1108); the old entry point still exports all of them.
export * from './custom-sdk-breakpoints.js';
export * from './custom-sdk-files.js';

// ---- the theme

const THEME_SELECTORS = new Set([':root,\n[data-theme="dark"]', '[data-theme="light"]']);

/** Why override CSS is not the block the theme editor writes (two selectors, `--name: value;` lines, every name and value passing the SDK's rules), or null. */
export function themeCssProblem(css) {
    const text = String(css ?? '').replace(/\r\n/g, '\n');
    if (!text.trim()) return null;
    const re = /^([^{}]+?) \{\n((?: {4}--[^\n{};]+;\n)*)\}\n/;
    let rest = text;
    while (rest) {
        const m = re.exec(rest);
        if (!m) return 'the theme CSS is not the override block the theme editor writes';
        if (!THEME_SELECTORS.has(m[1])) return `the theme CSS has a selector other than :root and [data-theme]: ${m[1].slice(0, 40)}`;
        for (const line of m[2].split('\n').filter(Boolean)) {
            const at = line.indexOf(':');
            const name = line.slice(4, at); const value = line.slice(at + 1).trim().replace(/;$/, '');
            const problem = nameProblem(name) ?? valueProblem(value);
            if (problem) return `${name}: ${problem}`;
        }
        rest = rest.slice(m[0].length);
    }
    return null;
}

const oneLine = css => css.replace(/\s*([{};,:])\s*/g, '$1').trim();
const crlf = text => text.replace(/\r?\n/g, '\r\n');
const eol = (text, sample) => (/\r\n/.test(sample) ? crlf(text) : text);
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

// ---- customising the shipped files

const isText = p => /\.(css|js|json|md|svg|html)$/.test(p);
const pageCss = p => p === 'plainkit.css' || p === 'plainkit.min.css';
const MODULES_DIR = 'modules/';
const isManifest = p => p === 'manifest.json' || p === `${MODULES_DIR}manifest.json`;
const hasMedia = p => /\.css$/.test(p) || /^elements\/[^/]+\.js$/.test(p);
const safePath = p => typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.includes('\\') && !p.split('/').some(s => s === '..' || s === '.' || s === '');

/**
 * The customised dist. files: Map of path (relative to dist, as the manifest lists it) -> Uint8Array, manifest.json included. include: { theme, breakpoints };
 * breakpoints: { name: width } (validated by the caller); theme: { css } (the override block, re-checked here). Returns { files, summary }, files being a new Map:
 * a file the customisation does not touch is the same bytes, and with the shipped widths and no theme every changed-by-rewrite file is byte-identical to the input.
 * Throws when a changed width is found nowhere, or a condition mentions one in a form that cannot be rewritten (no silent partial rewrite).
 */
export async function customizeDist(files, { include, breakpoints, theme }) {
    const out = new Map(files);
    const manifestBytes = files.get('manifest.json');
    if (!manifestBytes) throw new Error('the dist has no manifest.json');
    const manifest = JSON.parse(dec.decode(manifestBytes));
    const page = files.get('plainkit.css');
    if (!page) throw new Error('the dist has no plainkit.css');
    const shipped = readShippedBreakpoints(dec.decode(page));
    if (!Object.keys(shipped).length) throw new Error('plainkit.css has no --pk-bp-* block: not a Plainkit release with named breakpoints');
    const to = include.breakpoints ? { ...shipped, ...breakpoints } : { ...shipped };
    const changed = !sameWidths(shipped, to);
    const themeCss = include.theme && theme?.css ? theme.css : '';
    const problem = themeCssProblem(themeCss);
    if (problem) throw new Error(problem);
    const counts = Object.fromEntries(Object.keys(shipped).map(n => [n, 0]));
    const touched = [];
    if (changed || themeCss) {
        for (const [path, bytes] of files) {
            if (isManifest(path) || !isText(path)) continue;
            let text = dec.decode(bytes); const before = text;
            if (changed && hasMedia(path)) {
                const r = rewriteMedia(text, shipped, to, { comments: /\.css$/.test(path) });
                if (r.unhandled.length) throw new Error(`${path}: cannot rewrite ${r.unhandled.length} media condition(s) that use a changed width: ${r.unhandled[0]}`);
                text = r.text;
                for (const n of Object.keys(counts)) counts[n] += r.counts[n];
            }
            if (changed && pageCss(path)) text = rewriteProperties(text, to).text;
            if (path === 'breakpoints.report.json' && changed) text = eol(JSON.stringify(reportWithWidths(JSON.parse(text.replace(/\r\n/g, '\n')), to)) + '\n', text);
            if (themeCss && pageCss(path)) {
                const compact = path === 'plainkit.min.css';
                const nl = /\r\n/.test(before) ? '\r\n' : '\n';
                text = compact ? text.replace(/\r?\n$/, '') + oneLine(themeCss) + nl : text + eol(`\n/* Custom theme (${SETTINGS_NAME}) */\n${themeCss}`, before);
            }
            if (text !== before) { out.set(path, enc.encode(text)); touched.push(path); }
        }
        for (const n of Object.keys(counts)) if (to[n] !== shipped[n] && counts[n] === 0) throw new Error(`the ${n} breakpoint (${shipped[n]}px) was found in no @media condition: nothing was rewritten for it`);
    }
    // One manifest per unit: the runtime's (paths at the top of the dist) and, when the export carries the modules, the modules' (paths under modules/, listed relative to it).
    const custom = changed || Boolean(themeCss);
    let fileCount = 0;
    for (const prefix of files.has(`${MODULES_DIR}manifest.json`) ? ['', MODULES_DIR] : ['']) {
        const own = [...out].filter(([p]) => !isManifest(p) && (prefix ? p.startsWith(prefix) : !p.startsWith(MODULES_DIR)));
        const old = prefix ? files.get(`${prefix}manifest.json`) : manifestBytes;
        const was = JSON.parse(dec.decode(old));
        if (!touched.some(p => own.some(([q]) => q === p))) { fileCount += was.files.length + 1; continue; } // nothing of this unit changed: its manifest stays as shipped
        const entries = [];
        for (const [path, bytes] of own) entries.push({ path: path.slice(prefix.length), bytes: bytes.length, integrity: await integrityOf(bytes) });
        const provenance = custom ? `Customised export of Plainkit ${manifest.version} (see ${SETTINGS_NAME}); every file listed here is exactly what this bundle holds.` : was.provenance;
        out.set(`${prefix}manifest.json`, enc.encode(eol(manifestText({ version: manifest.version, files: entries, provenance, name: was.name, requires: was.requires }), dec.decode(old))));
        fileCount += entries.length + 1;
    }
    return { files: out, summary: { version: manifest.version, shipped, breakpoints: to, changedBreakpoints: changed, themeBaked: Boolean(themeCss), counts, touched: touched.sort(), fileCount } };
}

/** The files of a theme-only export: plainkit-theme.css, plainkit.custom.json and README.md, as a Map of zip path -> bytes. It needs no SDK file. */
export function themeBundle({ version, theme, shipped = {} }) {
    const problem = themeCssProblem(theme.css);
    if (problem) throw new Error(problem);
    const overrides = sanitizeOverrides(theme.overrides);
    const n = Object.keys(overrides.shared).length + Object.keys(overrides.dark).length + Object.keys(overrides.light).length;
    const include = { theme: true, breakpoints: false };
    const files = new Map();
    files.set('plainkit-theme.css', enc.encode(`/* Plainkit theme: ${n} token override${n === 1 ? '' : 's'}. Load it after plainkit.css. Settings: ${SETTINGS_NAME}. */\n${theme.css}`));
    files.set(SETTINGS_NAME, enc.encode(settingsText({ version, include, theme: overrides })));
    files.set('README.md', enc.encode(readmeText({ version, include, shipped, overrideCount: n, themeOnly: true })));
    return files;
}

/** The files of a bundle that carries the dist (breakpoints only, or theme and breakpoints): dist/..., plainkit.custom.json and README.md. */
export async function buildBundle(distFiles, { include, breakpoints, theme }) {
    const { files, summary } = await customizeDist(distFiles, { include, breakpoints, theme });
    const overrides = sanitizeOverrides(theme?.overrides);
    const n = Object.keys(overrides.shared).length + Object.keys(overrides.dark).length + Object.keys(overrides.light).length;
    const bundle = new Map();
    for (const [p, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) { if (!safePath(p)) throw new Error(`unsafe path in the dist: ${p}`); bundle.set(`dist/${p}`, bytes); }
    bundle.set(SETTINGS_NAME, enc.encode(settingsText({ version: summary.version, include, breakpoints: include.breakpoints ? summary.breakpoints : null, theme: include.theme ? overrides : null })));
    bundle.set('README.md', enc.encode(readmeText({ version: summary.version, include, breakpoints: summary.breakpoints, shipped: summary.shipped, overrideCount: include.theme ? n : 0 })));
    return { files: bundle, summary };
}
