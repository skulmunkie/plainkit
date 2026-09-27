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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = f => path.relative(root, f).split(path.sep).join('/');
const GENERATED = new Set(['site/gallery/gallery.data.js']);

// Raw pointer-drag wiring: setPointerCapture, or a pointerdown listener paired with a pointermove listener in the same file.
const DRAG = /\bsetPointerCapture\s*\(|addEventListener\(\s*['"]pointerdown['"]/;
const DRAG_MOVE = /addEventListener\(\s*['"]pointermove['"]/;
// Element-style keyboard navigation: a keydown handler whose file also branches on at least two of the arrow/Home/End keys.
const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
const KEYDOWN = /addEventListener\(\s*['"]keydown['"]/;
// A hand-built focus trap: collecting [tabindex] elements to cycle focus manually.
const FOCUS_TRAP = /querySelectorAll\(\s*['"]\[tabindex/;
// A manual interactive ARIA role set from JS (the element's own template owns this when the role belongs to a pk-* element).
const MANUAL_ROLE = /role\s*=\s*["'`](separator|dialog|menu|listbox)["'`]/;

function findings(dir) {
    const allow = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'composition.allow.json'), 'utf8')).interaction;
    const out = [];
    for (const f of walk(path.join(root, dir))) {
        const r = rel(f);
        if (!/\.js$/.test(r) || GENERATED.has(r) || /\.test\.mjs$/.test(r)) continue;
        const text = fs.readFileSync(f, 'utf8');
        const hits = [];
        if (DRAG.test(text) && DRAG_MOVE.test(text)) hits.push('raw pointer-drag wiring (setPointerCapture/pointerdown + pointermove): check pk-splitter or another element first');
        if (KEYDOWN.test(text) && ARROW_KEYS.filter(k => text.includes(k)).length >= 2) hits.push('arrow/Home/End key navigation: check pk-tree, pk-tabs, pk-menu or another element\'s own keyboard handling first');
        if (FOCUS_TRAP.test(text)) hits.push('hand-built focus trap ([tabindex] collection): pk-dialog already traps focus');
        if (MANUAL_ROLE.test(text)) hits.push('manual interactive ARIA role set from script: an existing element likely already owns this role');
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
