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
import { buildOverrides, nameProblem, valueProblem, sanitizeOverrides } from './theme.js';

// ---- named breakpoints (moved here from tools/breakpoints.mjs, which re-exports them for the build)

/** Validates a name -> width object: names are lowercase letters and digits (no hyphen, so `above-` is unambiguous), widths are integers, ascending. Returns [{ name, width }]. */
export function parseBreakpoints(obj) {
    const entries = Object.entries(obj ?? {});
    if (!entries.length) throw new Error('breakpoints: at least one breakpoint is required');
    let last = 0;
    return entries.map(([name, width]) => {
        if (!/^[a-z][a-z0-9]*$/.test(name)) throw new Error(`breakpoints: "${name}" is not a valid name (lowercase letters and digits, starting with a letter)`);
        if (!Number.isInteger(width) || width <= last) throw new Error(`breakpoints: "${name}" is ${width}; widths are integer px and must ascend (after ${last})`);
        last = width;
        return { name, width };
    });
}

/** name -> the media condition it stands for: `phone` -> (max-width: 640px), `above-phone` -> (min-width: 641px). */
export function conditionMap(bps) {
    const map = new Map();
    for (const { name, width } of bps) { map.set(name, `(max-width: ${width}px)`); map.set(`above-${name}`, `(min-width: ${width + 1}px)`); }
    return map;
}

// A comment, or the condition of an @media rule (up to its block).
const SCAN = /\/\*[\s\S]*?\*\/|(@media)([^{;]*)\{/g;

/** Replaces every `(--name)` inside an @media condition with its query; whitespace is kept. `file` only names the source in the error. */
export function resolveCustomMedia(css, bps, file = 'css') {
    const map = conditionMap(bps);
    return css.replace(SCAN, (whole, at, cond, offset) => {
        if (!at) return whole;
        const line = css.slice(0, offset).split('\n').length;
        const resolved = cond.replace(/\(\s*--([A-Za-z0-9-]+)\s*\)/g, (_m, name) => {
            const q = map.get(name);
            if (!q) throw new Error(`${file}:${line}: unknown breakpoint "--${name}" in @media; known: ${[...map.keys()].map(k => `--${k}`).join(', ')} (tokens/breakpoints.json)`);
            return q;
        });
        return `@media${resolved}{`;
    });
}

/** The widths as custom properties, one rule: `:root{--pk-bp-phone:640px;...}` (compact; the page layer is size-budgeted). */
export const breakpointProperties = bps => `:root{${bps.map(b => `--pk-bp-${b.name}:${b.width}px`).join(';')}}`;

// ---- the settings a consumer chooses

export const RANGE = Object.freeze({ min: 320, max: 2560, gap: 64 });

/** Checks the widths a consumer typed: { ok, widths: { name: n }, problems: [{ name, message }] }. `names` are the breakpoints of the SDK, in order (phone, tablet, wide). */
export function validateBreakpoints(input, names) {
    const problems = []; const widths = {};
    let last = null;
    for (const name of names) {
        const raw = input?.[name];
        const text = String(raw ?? '').trim();
        const n = Number(text);
        if (!text || !Number.isInteger(n)) { problems.push({ name, message: `${name} must be a whole number of pixels` }); last = null; continue; }
        widths[name] = n;
        if (n < RANGE.min || n > RANGE.max) problems.push({ name, message: `${name} must be between ${RANGE.min} and ${RANGE.max} px` });
        else if (last !== null && n <= last) problems.push({ name, message: `${name} must be wider than the breakpoint before it (${last} px)` });
        else if (last !== null && n - last < RANGE.gap) problems.push({ name, message: `${name} must be at least ${RANGE.gap} px wider than the one before it (${last} px)` });
        last = n;
    }
    return { ok: problems.length === 0, widths, problems };
}

/** The widths a page ships, read from the --pk-bp-* block of its plainkit.css: { phone: 640, ... } in file order. */
export function readShippedBreakpoints(pageCss) {
    const out = {};
    for (const m of String(pageCss).matchAll(/--pk-bp-([a-z][a-z0-9]*)\s*:\s*(\d+)px/g)) if (!(m[1] in out)) out[m[1]] = Number(m[2]);
    return out;
}

const sameWidths = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k]);

// ---- the width rewrite

const WIDTH = /(\(\s*)(max|min)(-width\s*:\s*)(\d+)(px\s*\))/g;

/**
 * Rewrites the widths in the @media conditions of a text: from = { name: old }, to = { name: new }. `(max-width: old)` becomes new, `(min-width: old + 1)` becomes
 * new + 1. One pass over the text, so a new width equal to another old one is never rewritten twice. Returns { text, counts: { name: n }, unhandled: [condition] }:
 * `unhandled` lists a condition that mentions a shipped width in a form this cannot rewrite (a range query, em units), which the caller must treat as an error.
 * `comments` is true for a stylesheet (a comment is skipped) and false for a script that carries CSS in a string.
 */
export function rewriteMedia(text, from, to, { comments = true } = {}) {
    const byOld = new Map(Object.entries(from).filter(([n]) => n in to).map(([n, w]) => [w, n]));
    const counts = Object.fromEntries(Object.keys(from).map(n => [n, 0]));
    const unhandled = [];
    const scan = comments ? SCAN : /(@media)([^{;]*)\{/g;
    const result = text.replace(scan, (whole, at, cond) => {
        if (!at) return whole;
        const next = cond.replace(WIDTH, (m, a, dir, b, digits, c) => {
            const px = Number(digits);
            const name = byOld.get(dir === 'max' ? px : px - 1);
            if (!name) return m;
            counts[name]++;
            return `${a}${dir}${b}${to[name] + (dir === 'max' ? 0 : 1)}${c}`;
        });
        const rest = cond.replace(WIDTH, '');
        if (/width/.test(rest) &&[...byOld.keys()].some(w => new RegExp(`\\b(?:${w}|${w + 1})(?:px)?\\b`).test(rest))) unhandled.push(cond.trim());
        return `@media${next}{`;
    });
    return { text: result, counts, unhandled };
}

/** Rewrites the --pk-bp-* custom properties (the block on :root in plainkit.css): { text, count }. */
export function rewriteProperties(text, to) {
    let count = 0;
    const result = text.replace(/(--pk-bp-)([a-z][a-z0-9]*)(\s*:\s*)(\d+)(px)/g, (m, a, name, b, _w, c) => { if (!(name in to)) return m; count++; return `${a}${name}${b}${to[name]}${c}`; });
    return { text: result, count };
}

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

// ---- the manifests (the build writes dist/manifest.json, the runtime unit, and dist/modules/manifest.json, the dev-tool modules unit, with this too)

export const DEFAULT_PROVENANCE = 'Generated by sdk/tools/build.mjs from the sources; reproducible.';

/**
 * A manifest as text (LF; the build and the export convert to the files' line endings): sorted files, no timestamps. files: [{ path, bytes, integrity }], paths relative to the
 * unit's own folder. The runtime unit is dist/manifest.json (name 'plainkit'); the modules unit is dist/modules/manifest.json (name 'plainkit-modules', with `requires` naming the
 * runtime it imports from).
 */
export function manifestText({ version, files, provenance = DEFAULT_PROVENANCE, name = 'plainkit', requires }) {
    const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return JSON.stringify({ name, version, ...(requires ? { requires } : {}), dependencies: [], runtimeRequests: 'none (same-origin only)', licence: 'MIT', provenance, files: sorted }, null, 2) + '\n';
}

/** What the modules unit needs from the runtime, as the modules manifest states it. */
export const modulesRequires = version => `plainkit ${version}: the modules import ../../js/*.js and use ../../plainkit.css and ../../elements/api.json of the runtime unit (see the plainkit-runtime meta tag and import map in core/README.md)`;

/** The SRI value for some bytes, `sha384-<base64>`, from SubtleCrypto (the build's Node hash gives the same). */
export async function integrityOf(bytes) {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-384', bytes));
    let binary = '';
    for (const b of digest) binary += String.fromCharCode(b);
    return `sha384-${btoa(binary)}`;
}

// ---- the settings file, the README

export const SETTINGS_NAME = 'plainkit.custom.json';
const emptyTheme = () => ({ shared: {}, dark: {}, light: {} });

/** plainkit.custom.json: what was chosen, so the export can be imported again. Deterministic (no dates). */
export function settingsText({ version, include, breakpoints, theme }) {
    return JSON.stringify({
        format: 'plainkit-custom-sdk', formatVersion: 1, baseVersion: version,
        include: { theme: Boolean(include.theme), breakpoints: Boolean(include.breakpoints) },
        breakpoints: breakpoints ?? {}, theme: theme ?? emptyTheme(),
    }, null, 2) + '\n';
}

/** Reads a settings file (or the theme editor's plain override JSON is NOT accepted here): { settings: { include, breakpoints, theme, baseVersion } } | { error }. Every value is re-validated. */
export function readSettings(text, names) {
    let raw;
    try { raw = JSON.parse(String(text ?? '')); } catch { return { error: 'The settings are not valid JSON.' }; }
    if (raw === null || typeof raw !== 'object' || raw.format !== 'plainkit-custom-sdk') return { error: `Not a ${SETTINGS_NAME} file (format "plainkit-custom-sdk" expected).` };
    if (raw.formatVersion !== 1) return { error: `Unsupported settings version ${raw.formatVersion}.` };
    const include = { theme: raw.include?.theme === true, breakpoints: raw.include?.breakpoints === true };
    let breakpoints = null;
    if (include.breakpoints) {
        const v = validateBreakpoints(raw.breakpoints, names);
        if (!v.ok) return { error: `The breakpoints in the file are not valid: ${v.problems.map(p => p.message).join('; ')}.` };
        breakpoints = v.widths;
    }
    const theme = sanitizeOverrides(raw.theme);
    return { settings: { baseVersion: String(raw.baseVersion ?? ''), include, breakpoints, theme } };
}

const list = widths => Object.entries(widths).map(([n, w]) => `${n} ${w}px`).join(', ');

/** README.md of an export. */
export function readmeText({ version, include, breakpoints, shipped, overrideCount, themeOnly }) {
    const lines = [`# Custom Plainkit ${themeOnly ? 'theme' : 'SDK'} (based on ${version})`, ''];
    lines.push(`Made in the browser by the Plainkit theme editor from release ${version}; nothing was sent anywhere. The settings that made it are in \`${SETTINGS_NAME}\`: paste that file into the editor's Custom SDK tab to change and export again.`, '');
    lines.push('## Settings', '');
    lines.push(`- Theme: ${include.theme ? `${overrideCount} token override${overrideCount === 1 ? '' : 's'}` : 'not included'}`);
    lines.push(`- Breakpoints: ${include.breakpoints ? `${list(breakpoints)} (the release ships ${list(shipped)})` : 'not included (the release widths)'}`, '');
    if (themeOnly) {
        lines.push('## Use it', '',
            'Load `plainkit-theme.css` after the SDK stylesheet:', '',
            '```html', '<link rel="stylesheet" href="plainkit/plainkit.css">', '<link rel="stylesheet" href="plainkit-theme.css">', '```', '',
            'Blazor: copy the file to `wwwroot/plainkit-theme.css` and add `<link rel="stylesheet" href="plainkit-theme.css" />` after the PlainKit stylesheet in `App.razor` (or `_Host.cshtml`).', '',
            'A strict `style-src` is fine: it is a file, not an inline style. No breakpoint or SDK file is changed.', '');
    } else {
        lines.push('## Use it', '',
            'The `dist/` folder has the release layout: use it wherever the release `dist/` is used (copy it next to your page, or serve it, and point the `<link>` and `<script>` at it). The dev-tool modules, when the export carries them, are `dist/modules/` (their own unit and manifest; they import the runtime next to them).',
            '', include.theme ? '- The theme is baked into `dist/plainkit.css` and `dist/plainkit.min.css` (after the token blocks).' : '',
            include.breakpoints ? '- The breakpoint widths are rewritten in `dist/plainkit.css`, `dist/plainkit.min.css`, `dist/elements/*.js` and the stylesheets of the tools, and `--pk-bp-*` on `:root` carries them for scripts.' : '',
            '- `dist/manifest.json` (and `dist/modules/manifest.json` for the modules) was recomputed: each file has its size and SRI hash (`integrity="sha384-..."`).', '');
    }
    return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').replace(/\n*$/, '\n');
}

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
            if (path === 'breakpoints.report.json' && changed) text = eol(JSON.stringify(reportWithWidths(JSON.parse(text.replace(/\r\n/g, '\n')), to), null, 1) + '\n', text);
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

/** The breakpoints report (dist/breakpoints.report.json) with the widths replaced, so the export describes itself. */
export function reportWithWidths(report, to) {
    const next = { ...report, breakpoints: report.breakpoints.map(b => ({ ...b, width: to[b.name] ?? b.width })), byBreakpoint: { ...report.byBreakpoint } };
    for (const b of next.breakpoints) next.byBreakpoint[b.name] = { ...report.byBreakpoint[b.name], width: b.width };
    return next;
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

// ---- the delta table

/**
 * What a change of widths moves, from the shipped report (dist/breakpoints.report.json): one row per breakpoint with the elements and properties that change there and
 * the viewport widths whose state flips (between the old and the new width). rows[i] = { name, from, to, changed, flips: [lo, hi] | null, elements: [{ element, below, above }], rules }.
 */
export function deltaRows(report, to) {
    return report.breakpoints.map(b => {
        const slot = report.byBreakpoint[b.name];
        const now = to[b.name] ?? b.width;
        const props = list => [...new Set(list.flatMap(r => r.properties))].sort();
        const elements = Object.entries(slot.elements).map(([element, d]) => ({ element, below: props(d.below), above: props(d.above) }));
        const lo = Math.min(b.width, now) + 1; const hi = Math.max(b.width, now);
        return { name: b.name, from: b.width, to: now, changed: now !== b.width, flips: now === b.width ? null : [lo, hi], elements, rules: slot.ruleCount };
    });
}
