// The Blazor mappings (blazor/mappings/<element>.json) against the SDK API (core/elements/<element>/<element>.meta.json). The SDK knows nothing
// about Blazor; this is where the two are kept in step. Dependency-free.
// Run: node --test scripts/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const elementsDir = path.join(root, 'core', 'elements');
const mappingsDir = path.join(root, 'blazor', 'mappings');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

const names = fs.readdirSync(elementsDir).filter(d => fs.existsSync(path.join(elementsDir, d, `${d}.meta.json`))).sort();
const metas = Object.fromEntries(names.map(n => [n, readJson(path.join(elementsDir, n, `${n}.meta.json`))]));
const files = fs.readdirSync(mappingsDir).filter(f => f.endsWith('.json')).sort();
const mappings = Object.fromEntries(files.map(f => [f.replace(/\.json$/, ''), readJson(path.join(mappingsDir, f))]));

// A component is named Pk plus its tag in PascalCase: pk-alert is PkAlert, pk-toast-stack is PkToastStack.
const pkName = tag => 'Pk' + tag.replace(/^pk-/, '').split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');

test('every element has exactly one mapping file and no mapping is orphaned', () => {
    assert.ok(names.length > 0, 'elements were found');
    assert.deepEqual(Object.keys(mappings).sort(), names);
    assert.equal(files.length, new Set(files).size);
});

test('a component is named Pk plus its tag in PascalCase', () => {
    for (const n of names) assert.equal(mappings[n].component, pkName(metas[n].tag), n);
});

test('every parameter maps to a real prop, slot, event or css property, or is a documented wrapper parameter', () => {
    for (const n of names) {
        const m = metas[n]; const b = mappings[n];
        assert.ok(Array.isArray(b.params) && b.params.length > 0, `${n} has params`);
        const seen = new Set();
        for (const p of b.params) {
            const at = `${n}.${p.name}`;
            assert.ok(p.name && !seen.has(p.name), `${at} is named once`); seen.add(p.name);
            assert.ok(['prop', 'slot', 'event', 'cssProperty', 'text', 'wrapper'].includes(p.map ?? (p.prop !== undefined ? 'prop' : p.slot !== undefined ? 'slot' : p.event !== undefined ? 'event' : p.cssProperty !== undefined ? 'cssProperty' : p.text !== undefined ? 'text' : 'wrapper')), `${at} map`);
            // A missing type is fine: the generator derives it from the SDK prop, and the mapping only overrides.
            assert.ok(p.type === undefined || typeof p.type === 'string', `${at} type`);
            if (p.prop !== undefined) assert.ok(m.props.some(x => x.name === p.prop), `${at} names a prop (${p.prop})`);
            else if (p.slot !== undefined) assert.ok(m.slots.some(x => x.name === p.slot) || p.note, `${at} names a slot (${p.slot}) or explains why it is not a fixed one`);
            else if (p.event !== undefined) assert.ok(m.events.some(x => x.name === p.event), `${at} names an event (${p.event})`);
            else if (p.cssProperty !== undefined) assert.ok(m.cssProperties.some(x => x.name === p.cssProperty), `${at} names a css property (${p.cssProperty})`);
            else if (p.text !== undefined) assert.equal(p.text, '', `${at} maps the element's own text content`);
            else assert.ok(p.note, `${at} explains why it stays in the wrapper`);
            if (p.map === 'wrapper') assert.ok(p.note, `${at} explains why it stays in the wrapper`);
        }
    }
});

test('two-way parameters name the change event that drives them', () => {
    for (const n of names) for (const p of mappings[n].params.filter(x => x.bind)) {
        assert.ok(metas[n].events.some(e => e.name === p.bind.event), `${n}.${p.name} binds to ${p.bind.event}`);
    }
});

test('every event a parameter maps to declares a detail (null, a native event, or typed fields) for the event-args class', () => {
    for (const n of names) for (const p of mappings[n].params.filter(x => x.event !== undefined)) {
        const e = metas[n].events.find(x => x.name === p.event);
        assert.ok(e && 'detail' in e, `${n}.${p.name}: event ${p.event} declares a detail`);
        assert.ok(e.detail === null || typeof e.detail === 'string' /* a native event, described */ || (typeof e.detail === 'object' && Object.values(e.detail).every(t => typeof t === 'string')), `${n}.${p.event} detail is typed`);
    }
});
