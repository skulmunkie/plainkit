// Builds the GitHub Pages site into _site/: the SDK's own site (gallery, files, scorecard, theme editor, dev tools, settings) plus the
// distributable dist/, so the same URL also works as a CDN prefix. It is a copy of what the site needs from core/, nothing else:
// no tests, tools, reports for other machines or node_modules. Node only, no dependencies.
//
//   node scripts/build-pages.mjs [outDir]      default _site
//
// Every page uses relative paths, so the site works under any prefix (https://<user>.github.io/plainkit/ included).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = path.join(root, 'core');
const out = path.resolve(root, process.argv[2] ?? '_site');

// Folders and files the site loads at run time (source layout) plus dist.
const INCLUDE = ['index.html', 'plainkit.css', 'icons.svg', 'tokens', 'base', 'components', 'elements', 'js', 'modules', 'layouts', 'samples', 'site', 'dist', 'LICENSE'];
const SKIP_NAMES = new Set(['node_modules', '.git']);
// Test files that sit beside sources (component and element folders) are not served.
const skip = name => SKIP_NAMES.has(name) || /\.test\.mjs$/.test(name);

function copy(from, to) {
    const stat = fs.statSync(from);
    if (stat.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        for (const entry of fs.readdirSync(from)) if (!skip(entry)) copy(path.join(from, entry), path.join(to, entry));
    } else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
    }
}

fs.rmSync(out, { recursive: true, force: true });
for (const item of INCLUDE) {
    const from = path.join(core, item);
    if (!fs.existsSync(from)) throw new Error(`core/${item} is missing: run node core/tools/build.mjs first`);
    copy(from, path.join(out, item));
}
// Pages must not run the site through Jekyll (it would hide any folder that starts with an underscore).
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const count = fs.readdirSync(out, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).length;
console.log(`${count} files written to ${path.relative(root, out) || out}`);
