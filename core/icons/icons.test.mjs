// Icon sprite build tests: lint rules, determinism, the size budget (core/icons/README.md), and that every icon name referenced anywhere in core
// (pk-icon name="...", pk-button icon-name="...", h('pk-icon', { name: ... })) exists in the sprite the build produces.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources, lintOne, build, SPRITE_BUDGET_BYTES } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every source icon passes lint (viewBox, currentColor-only, no id/class/style/script, kebab-case name, size)', () => {
    const problems = loadSources().flatMap(lintOne);
    assert.deepEqual(problems, []);
});

test('build() succeeds and the sprite stays under the documented budget', () => {
    const { spriteBytes, names } = build();
    assert.ok(spriteBytes <= SPRITE_BUDGET_BYTES, `${spriteBytes} bytes over the ${SPRITE_BUDGET_BYTES}-byte budget in core/icons/README.md`);
    assert.ok(names.length >= 60, `expected at least 60 icons after the phase-1 batch, got ${names.length}`);
    assert.deepEqual(names, [...names].sort(), 'icons.json names are sorted');
});

test('the build is deterministic: running it twice on the same sources gives byte-identical output', () => {
    const sources = loadSources();
    const a = build(sources);
    const b = build(sources);
    assert.equal(a.svg, b.svg);
    assert.equal(a.json, b.json);
    assert.equal(a.dts, b.dts);
});

test('a bad source is rejected: colour, id, style, class, script, wrong viewBox, bad name', () => {
    const base = { file: path.join(root, 'icons/src/__fixture__.svg') };
    const cases = [
        { name: 'ok-name', text: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>' }, // control: clean
        { name: 'bad', text: '<svg viewBox="0 0 24 24"><circle fill="red" cx="12" cy="12" r="8"/></svg>' },
        { name: 'bad', text: '<svg viewBox="0 0 24 24"><circle stroke="#000" cx="12" cy="12" r="8"/></svg>' },
        { name: 'bad', text: '<svg viewBox="0 0 24 24"><circle id="x" cx="12" cy="12" r="8"/></svg>' },
        { name: 'bad', text: '<svg viewBox="0 0 24 24"><circle class="x" cx="12" cy="12" r="8"/></svg>' },
        { name: 'bad', text: '<svg viewBox="0 0 24 24" style="color:red"><circle cx="12" cy="12" r="8"/></svg>' },
        { name: 'bad', text: '<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>' },
        { name: 'bad', text: '<svg viewBox="0 0 32 32"><circle cx="12" cy="12" r="8"/></svg>' },
        { name: 'Bad-Name', text: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>' },
    ];
    assert.deepEqual(lintOne({ ...base, ...cases[0] }), []);
    for (const c of cases.slice(1)) assert.ok(lintOne({ ...base, ...c }).length > 0, JSON.stringify(c));
});

// Every icon name referenced in core's own source (elements, modules, samples, layouts, site) must exist in the sprite the build produces -
// this is what would fail on a typo or a removed icon still referenced somewhere.
function scanIconNames(dir, names = new Set()) {
    if (!fs.existsSync(dir)) return names;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { scanIconNames(p, names); continue; }
        if (!/\.(html|js|mjs)$/.test(e.name) || /\.test\.mjs$/.test(e.name)) continue;
        const text = fs.readFileSync(p, 'utf8');
        for (const m of text.matchAll(/<pk-icon\b[^>]*\bname="([a-z0-9-]+)"/g)) names.add(m[1]);
        for (const m of text.matchAll(/\bicon-name=["']([a-z0-9-]+)["']/g)) names.add(m[1]);
        for (const m of text.matchAll(/h\(\s*['"]pk-icon['"]\s*,\s*\{\s*name:\s*['"]([a-z0-9-]+)['"]/g)) names.add(m[1]);
        for (const m of text.matchAll(/'icon-name':\s*'([a-z0-9-]+)'/g)) names.add(m[1]);
    }
    return names;
}

test('every icon name referenced by an element, module, sample, layout or site page exists in the sprite', () => {
    const { names: sprite } = build();
    const spriteSet = new Set(sprite);
    const used = new Set();
    for (const dir of ['elements', 'modules', 'samples', 'layouts', 'site']) scanIconNames(path.join(root, dir), used);
    const missing = [...used].filter(n => !spriteSet.has(n)).sort();
    assert.deepEqual(missing, [], `icon name(s) referenced in core but not in the sprite: ${missing.join(', ')}`);
    assert.ok(used.size >= 5, 'the scan actually found icon usages (a regex regression would silently pass with zero)');
});
