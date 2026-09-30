// Composition-tier rules C1 (dependency direction) and C3 (one element per page factory), #736 phase 2. Existing findings are ratcheted in
// core/tools/tiers.baseline.json (regenerate only after PAYING DOWN debt: `node core/tests/tiers.test.mjs --write-baseline` is not offered on
// purpose; edit by removing the entry you fixed). Only a new finding fails.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadElementSources } from '../tools/build.mjs';
import { checkTiers, key } from '../tools/tiers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = path.join(root, 'js/app/pages');
const factories = fs.readdirSync(pagesDir).filter(f => f.endsWith('.js')).map(f => {
    const source = fs.readFileSync(path.join(pagesDir, f), 'utf8');
    const id = /PAGE_TYPE\s*=\s*\{\s*id:\s*'([^']+)'/.exec(source)?.[1];
    return { id, file: f, source };
}).filter(f => f.id);
const elements = loadElementSources();
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tools/tiers.baseline.json'), 'utf8')).entries;

test('every page factory with a PAGE_TYPE is found', () => {
    assert.ok(factories.length >= 12, `found ${factories.length}`);
});

test('no new composition-tier debt (C1 dependency direction, C3 one element per page factory)', () => {
    const known = new Set(baseline.map(key));
    const fresh = checkTiers(elements, factories).filter(f => !known.has(key(f)));
    assert.deepEqual(fresh.map(f => `${f.rule} ${f.message}`), [],
        'FIX: make the element stop using the higher-tier element (compose downward only), or fix the pageType / factory pairing; never add to core/tools/tiers.baseline.json');
});

test('the baseline has no stale entry (a fixed finding is removed from it)', () => {
    const now = new Set(checkTiers(elements, factories).map(key));
    assert.deepEqual(baseline.map(key).filter(k => !now.has(k)), [], 'FIX: delete the listed entries from core/tools/tiers.baseline.json');
});

test('the rules detect what they claim', () => {
    const el = (name, tier, extra = {}) => ({ name, meta: { tag: `pk-${name}`, tier, ...extra }, template: '', css: '', behaviour: extra.behaviour ?? '' });
    const up = checkTiers([el('a', 'element', { behaviour: "h.innerHTML = '<pk-b></pk-b>'; // pk-c in a comment" }), el('b', 'component'), el('c', 'page', { pageType: 'x' })], [{ id: 'x', source: '' }]);
    assert.deepEqual(up.map(f => f.rule + ':' + f.ref), ['C1:pk-b', 'C3:pk-c']);
    assert.equal(checkTiers([el('b', 'component'), el('a', 'page', { pageType: 'x' })], [{ id: 'x', source: "createElement('pk-a')" }]).length, 0);
    assert.equal(checkTiers([el('a', 'page', { pageType: 'nope' })], []).length, 1);
    assert.equal(checkTiers([el('a', 'page', { pageType: 'x' }), el('b', 'page', { pageType: 'x' })], [{ id: 'x', source: 'pk-a pk-b' }]).length, 1);
});
