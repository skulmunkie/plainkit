// The base class's private namespace (#1980). PkElement (core/js/element.js, with element-core.js) keeps its own state on `this.$`, `this.$b`,
// `this.$q`, ... : names that start with `$`. An element that picks the same name for its own field (the #1980 failure: `this.$b` was overwritten
// and every pk-data-table render threw) corrupts the base silently. The reserved set is read from the base source, so it cannot go stale.
//
//   1. every `$name` the base class uses (as `this.$x`, `el.$x`, `c.$x`, or `$x =`) is reserved;
//   2. no element source (core/{elements,components,pages,shells}/*/*.js) and no core/js file other than the base declares, assigns or names
//      one of them (`this.$b = ...`, `$b = ...` as a class field, `'$b'` as a lazy-part key, `static $b`).
// To fix a finding rename the element's field (a descriptive name with the element's prefix), never the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listElementFolders } from '../tools/element-folders.mjs';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = ['js/element.js', 'js/element-core.js'];
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const read = f => strip(fs.readFileSync(path.join(core, f), 'utf8'));

export function reservedNames(texts) {
    const out = new Set();
    for (const t of texts) for (const m of t.matchAll(/\b(?:this|el)\.\$([A-Za-z_]\w*)/g)) out.add('$' + m[1]);
    return out;
}

// (`c.$k`, the template cache, lives on the class itself, not on instances, so an instance field `this.$k` does not collide with it.)
// Every $name token that is in the reserved set (a bare $ is the base's props bag, read but not declared by elements).
export function findCollisions(text, reserved) {
    const hits = [];
    text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/(?<![\w$])\$([A-Za-z_]\w*)/g)) if (reserved.has('$' + m[1])) hits.push({ line: i + 1, name: '$' + m[1], text: line.trim().slice(0, 120) });
    });
    return hits;
}

const reserved = reservedNames(BASE.map(read));

function sources() {
    const files = [];
    for (const e of listElementFolders(core)) for (const f of fs.readdirSync(e.dir)) if (f.endsWith('.js') && !f.endsWith('.element.js') && !f.endsWith('.test.js')) files.push(path.relative(core, path.join(e.dir, f)).split(path.sep).join('/'));
    for (const f of fs.readdirSync(path.join(core, 'js'))) if (f.endsWith('.js') && !BASE.includes('js/' + f)) files.push('js/' + f);
    return files;
}

test('the base class reserves a derivable set of $names', () => {
    for (const n of ['$b', '$q', '$r', '$u', '$wn', '$ws']) assert.ok(reserved.has(n), `${n} is used by element.js, so it is reserved (the set is read from the source: ${[...reserved]})`);
});

test('no element or core/js file reuses a name the base class reserves (#1980)', () => {
    const bad = [];
    for (const f of sources()) for (const h of findCollisions(read(f), reserved)) bad.push(`${f}:${h.line}  ${h.name}  ${h.text}`);
    assert.deepEqual(bad, [], `these names belong to PkElement (core/js/element.js) and shadow its state.\nFIX: rename the element's own field to a descriptive name with the element's prefix (this.$tableMedia), never reuse ${[...reserved].join(' ')}.\n${bad.join('\n')}`);
});

test('the collision finder catches the #1980 shapes', () => {
    const r = new Set(['$b', '$q']);
    for (const bad of ['this.$b = [];', 'this.$q ??= 1;', '    $b = 1;', 'static $b = 1;', "this.lz('$b', load);", 'x.$b.push(1)']) assert.equal(findCollisions(bad, r).length, 1, bad);
    for (const ok of ['this.$m = 1;', 'this.$bz = 2;', 'const price = `$b`;'.replace('`$b`', '5'), 'this.$mm?.cell()']) assert.equal(findCollisions(ok, r).length, 0, ok);
});
