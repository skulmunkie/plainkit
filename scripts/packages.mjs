// The package declaration (packages.json at the repository root, spec docs/superpowers/specs/2026-10-20-separate-packages-design.md, #1656) and the
// functions that read it: which package owns a file of core/dist, and which files a file imports. Declaration only (phase 0): nothing is moved or built
// from it yet; scripts/tests/packages.test.mjs keeps it true.
//
// A package is a release artifact plus a Pages folder (never npm). `plainkit` is core and owns every file no other package claims; the others claim
//   elements   tags (pk-dock): dist/elements/<tag without pk->.js
//   modules    dev-tool module folders: dist/modules/<name>/**
//   js         files of dist/js (a path relative to dist/js)
//   files      anything else, a path relative to dist/ (a trailing slash claims a folder)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Whether a dist file is site-only (packages.json siteOnly: owned by core, may import every package). */
export const isSiteOnly = (file, data) => (data.siteOnly ?? []).some(c => (c.endsWith('/') ? file.startsWith(c) : file === c));

export const CORE_ID = 'plainkit';

export function loadPackages(repo = REPO) {
    const file = path.join(repo, 'packages.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const byId = new Map(data.packages.map(p => [p.id, p]));
    return { data, packages: data.packages, byId, core: byId.get(CORE_ID) };
}

/** Every file of the dist tree, relative to dist/, sorted, with forward slashes. */
export function distFiles(distDir = path.join(REPO, 'core', 'dist')) {
    const out = [];
    const walk = (d, rel) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            e.isDirectory() ? walk(path.join(d, e.name), r) : out.push(r);
        }
    };
    walk(distDir, '');
    return out.sort();
}

/** The dist paths a package names explicitly (not core's remainder): each is a file path or a folder prefix ending in '/'. */
export function claims(pkg) {
    return [
        ...(pkg.elements ?? []).map(t => `elements/${t.replace(/^pk-/, '')}.js`),
        ...(pkg.modules ?? []).map(m => `modules/${m}/`),
        ...(pkg.js ?? []).map(f => `js/${f}`),
        ...(pkg.files ?? []),
    ];
}

const claimed = (claim, file) => (claim.endsWith('/') ? file.startsWith(claim) : file === claim);

/** The ids of every package that owns `file`: the explicit claims, or core when nobody claims it. A well-formed declaration yields exactly one. */
export function ownersOf(file, packages) {
    const hit = packages.filter(p => p.id !== CORE_ID && claims(p).some(c => claimed(c, file))).map(p => p.id);
    return hit.length ? hit : [CORE_ID];
}

/** Static and literal dynamic imports of a minified or plain dist file, as dist-relative paths. */
export function importsOf(distDir, file) {
    const text = fs.readFileSync(path.join(distDir, file), 'utf8');
    const out = new Set();
    for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+\.js)["']/g)) {
        if (/^[a-z]+:|^\//.test(m[1])) continue;
        out.add(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
    }
    return [...out];
}

/** The ids a package may import from: itself and every package it requires, transitively. */
export function allowedOwners(id, byId) {
    const out = new Set([id]);
    const q = [id];
    while (q.length) for (const r of byId.get(q.pop())?.requires ?? []) if (!out.has(r)) { out.add(r); q.push(r); }
    return out;
}
