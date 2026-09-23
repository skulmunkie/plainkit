// Builds the GitHub Pages site into _site/: the SDK's own site (gallery, files, scorecard, theme editor, dev tools, settings) plus the
// distributable dist/, so the same URL also works as a CDN prefix. It is a copy of what the site needs from core/, plus (issue 196)
// tests/tools/icons whole, so the Files page's code explorer can fetch real source same-origin (STANDARDS.md, "Security (CSP)": no
// runtime request to another origin) instead of embedding it: no node_modules or .git either way. Node only, no dependencies.
//
//   node scripts/build-pages.mjs [outDir]      default _site
//
// Every page uses relative paths, so the site works under any prefix (https://<user>.github.io/plainkit/ included).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureGenerated } from './generated.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = path.join(root, 'core');
const out = path.resolve(root, process.argv[2] ?? '_site');
ensureGenerated(); // dist/ and the site's generated modules are not in git: bootstrap when they are missing

// Folders and files the site loads at run time (source layout) plus dist. Test files beside a component or element are stripped here
// (they are not part of what a page imports), but kept whole in FULL below: the code explorer browses the real source tree, tests included.
const INCLUDE = ['index.html', 'plainkit.css', 'icons.svg', 'tokens', 'base', 'elements', 'js', 'modules', 'layouts', 'samples', 'site', 'dist', 'LICENSE'];
const FULL = ['tests', 'tools', 'icons'];
const SKIP_NAMES = new Set(['node_modules', '.git']);
const skip = name => SKIP_NAMES.has(name) || /\.test\.mjs$/.test(name);
const skipFull = name => SKIP_NAMES.has(name);

function copy(from, to, skipFn) {
    const stat = fs.statSync(from);
    if (stat.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        for (const entry of fs.readdirSync(from)) if (!skipFn(entry)) copy(path.join(from, entry), path.join(to, entry), skipFn);
    } else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
    }
}

fs.rmSync(out, { recursive: true, force: true });
for (const item of INCLUDE) {
    const from = path.join(core, item);
    if (!fs.existsSync(from)) throw new Error(`core/${item} is missing: run node scripts/bootstrap.mjs first`);
    copy(from, path.join(out, item), skip);
}
for (const item of FULL) {
    const from = path.join(core, item);
    if (!fs.existsSync(from)) throw new Error(`core/${item} is missing: run node scripts/bootstrap.mjs first`);
    copy(from, path.join(out, item), skipFull);
}
// Pages must not run the site through Jekyll (it would hide any folder that starts with an underscore).
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const count = fs.readdirSync(out, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).length;
console.log(`${count} files written to ${path.relative(root, out) || out}`);
