// Per-tier raw-HTML rules (#736 phase 3): D1, S3 and T1 (structural div/span) on component, page and shell sources, ratcheted in core/tools/tier-tags.baseline.json.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadElementSources } from '../tools/build.mjs';
import { checkTierTags, entryKey } from '../tools/tier-tags.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = path.join(root, 'tools/tier-tags.baseline.json');
const now = checkTierTags(loadElementSources());
const baseline = new Map(JSON.parse(fs.readFileSync(baselineFile, 'utf8')).entries.map(e => [entryKey(e), e.count]));

test('no new raw-tag or class debt in component, page or shell sources', () => {
    const over = [...now].filter(([k, n]) => n > (baseline.get(k) ?? 0)).map(([k, n]) => `${k}: ${n} (baseline ${baseline.get(k) ?? 0})`);
    assert.deepEqual(over, [], 'FIX: compose the pk-* element instead of the raw tag (D1) or class (S3); never raise core/tools/tier-tags.baseline.json');
});

test('the baseline is not stale (paid-down debt is lowered in it)', () => {
    const under = [...baseline].filter(([k, n]) => (now.get(k) ?? 0) < n).map(([k, n]) => `${k}: now ${now.get(k) ?? 0}, baseline ${n}`);
    assert.deepEqual(under, [], 'FIX: lower or delete these entries in core/tools/tier-tags.baseline.json');
});

test('the rules detect what they claim, and exempt element sources and shell landmarks', () => {
    const el = (name, tier, template, behaviour = null) => ({ name, meta: { tier }, template, behaviour });
    const got = checkTierTags([
        el('a', 'component', '<button class="x"></button><div></div><div></div><span></span>', "el.classList.add('y'); document.createElement('div')"),
        el('b', 'element', '<button class="x"></button>'),
        el('c', 'shell', '<header></header><nav></nav><div></div><span></span><button></button>'),
    ]);
    assert.deepEqual([...got].sort(), [['D1 a button', 1], ['D1 c button', 1], ['S3 a class=', 1], ['S3 a classList', 1], ['T1 a div', 3], ['T1 a span', 1]].sort());
});
