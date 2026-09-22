// Publishes the toolkit into the Blazor package: copies core/dist to blazor/src/PlainKit.Blazor/wwwroot/plainkit, byte for byte, so the
// NuGet package serves exactly what npm ships. Node only, no dependencies.
//
//   node scripts/publish-dist.mjs           copy (replaces the target folder)
//   node scripts/publish-dist.mjs --check   change nothing; exit 1 when the copy is out of date (CI)
//
// Run `node core/tools/build.mjs` first: this copies whatever is in core/dist.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'core', 'dist');
const target = path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot', 'plainkit');

// Design-time/editor files (npm/CDN consumers' IDE tooling and the exported agent docs, #178) that no Blazor component, PkRuntime or the
// dev tools ever fetch at runtime (checked: only elements/api.json and breakpoints.report.json are `fetch()`d, by the console/layout-builder/
// theme-editor modules and blazor-devtools.js — both stay). Excluding them here keeps them out of the package entirely (#186): they are still
// built into core/dist for npm/CDN, and shipped separately as skills/dist release assets (#36).
const EXCLUDE_FROM_BLAZOR = new Set([
    'custom-elements.json',
    'web-types.json',
    'vscode.html-custom-data.json',
    'elements.d.ts',
    'elements.vue.d.ts',
    'AGENTS.md',
    'llms.txt',
    'llms-full.txt',
]);

const list = (dir, exclude = null) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.relative(dir, path.join(e.parentPath, e.name)).replaceAll('\\', '/')).filter(f => !exclude || !exclude.has(f)).sort() : []);

export function differences(from = source, to = target) {
    const a = list(from, EXCLUDE_FROM_BLAZOR), b = new Set(list(to));
    const out = [];
    for (const f of a) {
        if (!b.has(f)) out.push(`missing: ${f}`);
        else if (!fs.readFileSync(path.join(from, f)).equals(fs.readFileSync(path.join(to, f)))) out.push(`changed: ${f}`);
    }
    for (const f of b) if (!a.includes(f)) out.push(`extra: ${f}`);
    return out;
}

export function publish(from = source, to = target) {
    fs.rmSync(to, { recursive: true, force: true });
    for (const f of list(from, EXCLUDE_FROM_BLAZOR)) {
        fs.mkdirSync(path.dirname(path.join(to, f)), { recursive: true });
        fs.copyFileSync(path.join(from, f), path.join(to, f));
    }
    return list(to).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (!fs.existsSync(source)) { console.error('core/dist does not exist: run node scripts/bootstrap.mjs first'); process.exit(2); }
    if (process.argv.includes('--check')) {
        const d = differences();
        if (d.length) { console.error(`blazor/src/PlainKit.Blazor/wwwroot/plainkit is out of date (${d.length} differences); run node scripts/publish-dist.mjs\n${d.slice(0, 10).join('\n')}`); process.exit(1); }
        console.log('wwwroot/plainkit matches core/dist');
    } else {
        console.log(`${publish()} files published to ${path.relative(root, target)}`);
    }
}
