// The SDK's public surface: every class a stylesheet defines, every token, every JS export, and every element's API (tag, props with their
// type, default and enum values, slots, events, parts, CSS properties, methods). node core/tools/api-surface.mjs [--write [--release <version>]]
// site/scorecard/api.baseline.json is the previous RELEASE: what a release must not break without the version saying so (tools/versioning.mjs
// computes the bump the differences need). --write refreshes it from the current sources; a release pull request does that with --release.
import fs from 'node:fs';
import path from 'node:path';
import { deprecatedItems } from './element-api.mjs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (['dist', 'node_modules', 'tests'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// The element API as flat items, so a removed prop, event or enum value (or a changed type or default) shows as a missing item.
export function elementSurface(dir = path.join(root, 'elements')) {
    const items = [];
    for (const d of fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())) {
        const file = path.join(dir, d.name, `${d.name}.meta.json`);
        if (!fs.existsSync(file)) continue;
        const m = JSON.parse(fs.readFileSync(file, 'utf8'));
        const tag = m.tag;
        items.push(tag);
        for (const p of m.props ?? []) {
            items.push(`${tag}:prop:${p.name}`, `${tag}:prop:${p.name}:type=${p.type}`);
            if (p.default !== undefined && p.default !== null && p.default !== '') items.push(`${tag}:prop:${p.name}:default=${JSON.stringify(p.default)}`);
            for (const v of p.values ?? []) items.push(`${tag}:prop:${p.name}:value=${v}`);
        }
        for (const s of m.slots ?? []) items.push(`${tag}:slot:${s.name || '(default)'}`);
        for (const e of m.events ?? []) items.push(`${tag}:event:${e.name}`);
        for (const x of m.parts ?? []) items.push(`${tag}:part:${x.name}`);
        for (const c of m.cssProperties ?? []) items.push(`${tag}:css:${c.name}`);
        for (const x of m.methods ?? []) items.push(`${tag}:method:${x.name}`);
    }
    return [...new Set(items)].sort();
}

// What the metas deprecate, [{ item, since, remove }] sorted by item (the baseline keeps the list of the last release, so versioning.mjs can tell an announced removal).
export function deprecations(dir = path.join(root, 'elements')) {
    const out = [];
    for (const d of fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())) {
        const file = path.join(dir, d.name, `${d.name}.meta.json`);
        if (fs.existsSync(file)) out.push(...deprecatedItems(JSON.parse(fs.readFileSync(file, 'utf8'))).map(({ item, since, remove }) => ({ item, since, remove })));
    }
    return out.sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
}

export function surface() {
    const files = walk(root);
    const cssDirs = f => /(^|[\\/])(modules[\\/][^\\/]+[\\/][^\\/]+|tokens[\\/]tokens|base[\\/][^\\/]+)\.css$/.test(path.relative(root, f));
    const css = files.filter(f => f.endsWith('.css') && cssDirs(f)).map(f => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
    const classes = [...new Set([...css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map(m => m[1]))].sort();
    const tokens = [...new Set([...fs.readFileSync(path.join(root, 'tokens', 'tokens.css'), 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]))].sort();
    const exports = [];
    for (const f of files.filter(f => /\.js$/.test(f) && /[\\/]js[\\/]/.test(f))) {
        const rel = path.relative(root, f).split(path.sep).join('/');
        for (const m of fs.readFileSync(f, 'utf8').matchAll(/^export (?:async )?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) exports.push(`${rel}:${m[1]}`);
    }
    return { classes, tokens, exports: exports.sort(), elements: elementSurface() };
}

export function removed(baseline, current) {
    const out = [];
    for (const k of ['classes', 'tokens', 'exports', 'elements']) for (const x of baseline[k] ?? []) if (!(current[k] ?? []).includes(x)) out.push(`${k}: ${x}`);
    return out;
}

// --current writes site/scorecard/api.current.json: the surface as it is now, for the scorecard's API section to diff against the baseline.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--current')) {
    fs.writeFileSync(path.join(root, 'site', 'scorecard', 'api.current.json'), JSON.stringify(surface(), null, 1) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
    const file = path.join(root, 'site', 'scorecard', 'api.baseline.json');
    const at = process.argv.indexOf('--release');
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).release ?? null : null;
    const s = { release: at >= 0 ? process.argv[at + 1] : previous, ...surface(), deprecated: deprecations() };
    fs.writeFileSync(file, (JSON.stringify(s, null, 1) + '\n').replace(/\n/g, '\r\n'));
    console.log(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])));
}
