// Internal chrome tokens (--_te-*, --_sc-*, ...) belong to PlainKit's own site/devtools pages (#710). They are not part of the public
// token set: no documentation, skill, guide or gallery sample may mention one, and none may appear in the API-surface token list.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { surface } from '../tools/api-surface.mjs';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(core, '..');
const tokensCss = fs.readFileSync(path.join(core, 'tokens', 'tokens.css'), 'utf8');
const internal = [...new Set([...tokensCss.matchAll(/(--_[a-z0-9-]+)\s*:/g)].map(m => m[1]))];
const families = [...new Set(internal.map(n => n.match(/^--_[a-z]+(?:-[a-z]+)?-/)[0]))];

function walk(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? (['node_modules', '.git', 'bin', 'obj'].includes(e.name) ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));
}

test('internal tokens exist and use the reserved --_ prefix only', () => {
    assert.ok(internal.length > 30, 'the chrome families are defined in tokens.css');
    for (const m of tokensCss.matchAll(/(?<![\w-])--(te|sc|ce|gd|lb|gx|gal-pv|gal-shell)-[a-z0-9]+[a-z0-9-]*\s*:/g)) assert.fail(`${m[0]} is a chrome token and must be written --_${m[1]}-...`);
});

test('internal tokens are not in the API surface', () => {
    const leaked = surface().tokens.filter(t => /^--(te|sc|ce|gd|lb|gx|gal)-/.test(t));
    assert.deepEqual(leaked, []);
});

test('no public doc, skill, guide or gallery sample mentions an internal token', () => {
    const roots = [path.join(repo, 'scripts', 'skills'), path.join(repo, 'docs'), path.join(core, 'dist', 'skills'), path.join(core, 'site', 'guides'), path.join(core, 'site', 'gallery'),
        path.join(core, 'elements'), path.join(core, 'components'), path.join(core, 'pages'), path.join(core, 'shells')];
    const files = [...roots.flatMap(walk), ...fs.readdirSync(repo).filter(f => f.endsWith('.md')).map(f => path.join(repo, f)), path.join(core, 'STANDARDS.md')]
        .filter(f => /\.(md|html|json)$/.test(f) && !/\.(test|element)\./.test(f) && !/[\/]superpowers[\/]/.test(f) && !/gallery\.data\.js$/.test(f));
    const hits = [];
    for (const f of files) {
        const text = fs.readFileSync(f, 'utf8');
        for (const fam of families) if (text.includes(fam)) hits.push(`${path.relative(repo, f)} mentions ${fam}*`);
    }
    assert.deepEqual(hits, [], 'FIX: internal chrome tokens (--_xx-*) are not public; remove the mention from the doc, skill or sample');
});
