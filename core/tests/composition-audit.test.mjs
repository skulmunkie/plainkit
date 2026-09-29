// Composition gate (#392, follows the audit #390/#391): core/site/** and core/modules/** compose from existing pk-* elements; core/elements/** is the only
// place that legitimately wires raw pointer drag, arrow-key list/tree navigation, a hand-built focus trap or a manual interactive ARIA role. A file outside
// core/elements/** that does one of these needs an entry in tools/composition.allow.json with a reason, the same shape as tools/security.allow.json for
// innerHTML sinks. The SECOND time the same shape of logic is hand-written elsewhere, it is no longer legitimate custom: file it under #336 instead of adding
// another allow-list entry (core/STANDARDS.md, "Composition: check before you build").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk } from '../tools/security.mjs';
import { scanPointerDrag, scanArrowKeyNav, scanFocusTrap, scanManualRole } from '../tools/audit/scanners/composition.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = f => path.relative(root, f).split(path.sep).join('/');
const GENERATED = new Set(['site/gallery/gallery.data.js']);

// The regex logic itself now lives in core/tools/audit/scanners/composition.mjs (#612, A-2 of the
// conformance-audit design), shared with the consumer-facing D3-D6 rules, so this internal gate and that
// public rule table read one implementation and cannot drift apart. Behaviour here is unchanged.
const DETECTORS = [
    { scan: scanPointerDrag, suffix: ': check pk-splitter or another element first' },
    { scan: scanArrowKeyNav, suffix: ': check pk-tree, pk-tabs, pk-menu or another element\'s own keyboard handling first' },
    { scan: scanFocusTrap, suffix: ': pk-dialog already traps focus' },
    { scan: scanManualRole, suffix: ': an existing element likely already owns this role' },
];

function findings(dir) {
    const allow = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'composition.allow.json'), 'utf8')).interaction;
    const out = [];
    for (const f of walk(path.join(root, dir))) {
        const r = rel(f);
        if (!/\.js$/.test(r) || GENERATED.has(r) || /\.test\.mjs$/.test(r)) continue;
        const text = fs.readFileSync(f, 'utf8');
        const hits = [];
        for (const { scan, suffix } of DETECTORS) {
            for (const hit of scan(text)) hits.push(`${hit.message}${suffix}`);
        }
        if (hits.length && !allow[r]) out.push({ file: r, hits });
    }
    return out;
}

test('core/site and core/modules: hand-rolled interaction logic is allow-listed with a reason, not silently reimplementing an element', () => {
    const bad = [...findings('site'), ...findings('modules')];
    assert.deepEqual(bad, [], bad.map(b => `FIX: ${b.file} — ${b.hits.join('; ')} (add a reason to tools/composition.allow.json, or compose from the element instead)`).join('\n'));
});

test('every composition.allow.json entry still matches a real file', () => {
    const allow = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'composition.allow.json'), 'utf8')).interaction;
    for (const r of Object.keys(allow)) assert.ok(fs.existsSync(path.join(root, r)), `FIX: tools/composition.allow.json lists ${r}, which no longer exists — remove the entry`);
});
