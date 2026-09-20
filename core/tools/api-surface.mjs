// The SDK's public surface: every class a stylesheet defines, every token, every JS export. node core/tools/api-surface.mjs [--write]
// site/scorecard/api.baseline.json is the previous release; the compat test fails when anything in it has been removed or renamed.
// Adding is always fine. To remove on purpose, edit the baseline in the same commit and say why in the commit message.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (['dist', 'node_modules', 'tests'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

export function surface() {
    const files = walk(root);
    const cssDirs = f => /(^|[\\/])(components[\\/][^\\/]+[\\/][^\\/]+|modules[\\/][^\\/]+[\\/][^\\/]+|tokens|base|a11y)\.css$/.test(path.relative(root, f));
    const css = files.filter(f => f.endsWith('.css') && cssDirs(f)).map(f => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
    const classes = [...new Set([...css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map(m => m[1]))].sort();
    const tokens = [...new Set([...fs.readFileSync(path.join(root, 'tokens', 'tokens.css'), 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]))].sort();
    const exports = [];
    for (const f of files.filter(f => /\.js$/.test(f) && /[\\/](js|components)[\\/]/.test(f))) {
        const rel = path.relative(root, f).split(path.sep).join('/');
        for (const m of fs.readFileSync(f, 'utf8').matchAll(/^export (?:async )?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) exports.push(`${rel}:${m[1]}`);
    }
    return { classes, tokens, exports: exports.sort() };
}

export function removed(baseline, current) {
    const out = [];
    for (const k of ['classes', 'tokens', 'exports']) for (const x of baseline[k]) if (!current[k].includes(x)) out.push(`${k}: ${x}`);
    return out;
}

// --current writes site/scorecard/api.current.json: the surface as it is now, for the scorecard's API section to diff against the baseline.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--current')) {
    fs.writeFileSync(path.join(root, 'site', 'scorecard', 'api.current.json'), JSON.stringify(surface(), null, 1) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
    const s = surface();
    fs.writeFileSync(path.join(root, 'site', 'scorecard', 'api.baseline.json'), JSON.stringify(s, null, 1) + '\n');
    console.log(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length])));
}
