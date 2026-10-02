// The one place that knows where element folders live (#767, spec phases 5-6). An element is a folder <name>/ holding <name>.html, .css, .meta.json (and .js);
// which top folder holds it follows its tier: core/elements (element), core/components, core/pages, core/shells. The tier folders are optional: each exists only
// once scripts/move-tiers.mjs has moved its first element, so every directory walker goes through this file instead of reading core/elements itself.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TIER_FOLDERS = ['elements', 'components', 'pages', 'shells'];

/** The tier folders that exist under `coreDir` (a Set of names, 'elements' included when present). */
export function existingTierFolders(coreDir = CORE) {
    return new Set(TIER_FOLDERS.filter(f => fs.existsSync(path.join(coreDir, f))));
}

/** Every element folder under the tier folders of `coreDir`, sorted by name: [{ name, dir (absolute), folder ('elements' | 'components' | 'pages' | 'shells') }]. */
export function listElementFolders(coreDir = CORE) {
    const out = [];
    for (const folder of TIER_FOLDERS) {
        const base = path.join(coreDir, folder);
        if (!fs.existsSync(base)) continue;
        for (const d of fs.readdirSync(base, { withFileTypes: true })) if (d.isDirectory()) out.push({ name: d.name, dir: path.join(base, d.name), folder });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The folder of one element by name ({ name, dir, folder }), or undefined. */
export const findElementFolder = (name, coreDir = CORE) => listElementFolders(coreDir).find(e => e.name === name);

/** { folder, name, rest } for a repo-relative path inside an element folder (`core/<tier folder>/<name>/<rest>`), else null (`core/elements/registry.js` has no folder). */
export function elementOfPath(relPath) {
    const m = new RegExp(`^core/(${TIER_FOLDERS.join('|')})/([^/]+)/(.+)$`).exec(relPath.replace(/\\/g, '/'));
    return m ? { folder: m[1], name: m[2], rest: m[3] } : null;
}

/** The absolute path of a file of an element (`name.ext` by default) wherever its folder is. */
export function elementFile(name, ext, coreDir = CORE) {
    const e = findElementFolder(name, coreDir);
    if (!e) throw new Error(`no element folder named ${name} under core/{${TIER_FOLDERS.join(',')}}`);
    return path.join(e.dir, ext ? `${name}.${ext}` : name);
}
