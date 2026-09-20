// Which components a piece of markup uses, worked out from the classes it carries. Shared by the build (sample meta files are checked
// against it) and the usage index. A class belongs to the first component, in cascade order, whose stylesheet defines it.

import fs from 'node:fs';
import path from 'node:path';

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

export function classOwners(root) {
    const comp = path.join(root, 'components');
    const { order } = JSON.parse(read(path.join(comp, 'order.json')));
    const owners = new Map();
    for (const name of order) {
        const f = path.join(comp, name, `${name}.css`);
        if (!fs.existsSync(f)) continue;
        const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of css.matchAll(/(?:^|[}{,])\s*([^{};@]*?)\{/g)) for (const c of m[1].matchAll(/\.([A-Za-z][\w-]*)/g)) if (!owners.has(c[1])) owners.set(c[1], name);
    }
    return owners;
}

// Class names written in markup or in a script that builds markup: class="a b", className = 'a b', class: "a b".
export function classesIn(text) {
    const out = new Set();
    for (const m of text.matchAll(/\bclass(?:Name)?\s*[=:]\s*\\?["'`]([^"'`\\]+)/g)) for (const c of m[1].split(/\s+/)) if (/^[A-Za-z][\w-]*$/.test(c)) out.add(c);
    return out;
}

// Components used by markup or a script that builds it: by class (the class-based layer) and by <pk-name> tag (the elements).
export function usedComponents(text, owners, elementNames = new Set()) {
    const tags = [...text.matchAll(/<pk-([a-z][a-z0-9-]*)/g)].map(m => m[1]).filter(n => elementNames.has(n));
    return [...new Set([...[...classesIn(text)].map(c => owners.get(c)).filter(Boolean), ...tags])].sort();
}

export function elementFolders(root) {
    const dir = path.join(root, 'elements');
    return new Set(fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : []);
}
