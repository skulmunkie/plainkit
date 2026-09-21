// Deprecation (issue #23): the meta field and its validation, the generated module (only an element that deprecates something imports the helper),
// the warnings (once per page and item, through the logger), and the policy against the last release (an announced item is not removed early).
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateApi, deprecatedItems, deprecationSpec } from '../tools/element-api.mjs';
import { elementModule, loadElementSources } from '../tools/build.mjs';
import { deprecationProblems, dueForRemoval, readVersion } from '../tools/versioning.mjs';
import { surface, deprecations } from '../tools/api-surface.mjs';
import { createLogger, getLogBuffer, clearLogBuffer } from '../js/log.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const sources = loadElementSources();
const badge = sources.find(e => e.name === 'badge');
const D = { since: '0.2.0-alpha.1', remove: '0.3.0-alpha.1', message: 'use "tone" instead' };

// badge with a deprecated prop, event and slot, and the whole element.
const withDeprecations = () => {
    const meta = structuredClone(badge.meta);
    meta.props[0].deprecated = D;
    meta.events.push({ name: 'pk-old', detail: null, description: 'Old.', deprecated: D });
    meta.slots.push({ name: 'legacy', description: 'Old slot.', deprecated: D });
    return meta;
};

test('deprecated is validated on the element, props, events and slots: since and remove are versions, at least one minor apart, with a message', () => {
    const meta = withDeprecations();
    const problems = m => validateApi(m, { template: `${badge.template}<slot name="legacy"></slot>`, css: badge.css, name: 'badge' });
    assert.deepEqual(problems(meta), []);
    const bad = (mutate, expected) => { const m = withDeprecations(); mutate(m); assert.match(problems(m).join('\n'), expected); };
    bad(m => { m.deprecated = { since: '0.2.0' }; }, /the element: deprecated needs \{ since, remove, message \}/);
    bad(m => { m.props[0].deprecated = { ...D, remove: 'soon' }; }, /prop "variant": deprecated needs/);
    bad(m => { m.props[0].deprecated = { ...D, remove: '0.2.0' }; }, /must be at least one minor version after/);
    bad(m => { m.props[0].deprecated = { ...D, remove: '0.2.0-alpha.2' }; }, /at least one minor version/);
    bad(m => { m.props[0].deprecated = { ...D, message: '' }; }, /deprecated needs/);
    bad(m => { m.parts[0].deprecated = D; }, /part ".*": deprecated is supported on the element, props, events and slots only/);
    meta.deprecated = D;
    assert.deepEqual(problems(meta), []);
});

test('deprecatedItems names each item like the API surface does, and the spec is null for an element that deprecates nothing', () => {
    const meta = withDeprecations(); meta.deprecated = D;
    assert.deepEqual(deprecatedItems(meta).map(d => d.item), ['pk-badge', 'pk-badge:prop:variant', 'pk-badge:event:pk-old', 'pk-badge:slot:legacy']);
    assert.equal(deprecationSpec(badge.meta), null);
    assert.deepEqual(Object.keys(deprecationSpec(meta).props), ['variant']);
});

test('the generated module imports the helper only when the element deprecates something, and the base runtime does not know about deprecation', () => {
    const plain = elementModule(badge, { coreImport: '../../js/element.js' });
    assert.doesNotMatch(plain, /deprecat/i);
    const el = { ...badge, meta: withDeprecations() };
    const js = elementModule(el, { coreImport: '../../js/element.js' });
    assert.match(js, /import \{ deprecations \} from '\.\.\/\.\.\/js\/deprecation\.js';/);
    assert.match(js, /extends deprecations\(behaviour\(PkElement\), \{"tag":"pk-badge"/);
    assert.match(elementModule(el, { coreImport: '../js/element.js' }), /from '\.\.\/js\/deprecation\.js'/, 'the dist module too');
    for (const f of ['js/element.js', 'js/element-core.js']) assert.doesNotMatch(read(f), /deprecat/i, `${f} carries no deprecation code`);
    for (const e of sources.filter(e => !deprecationSpec(e.meta))) assert.doesNotMatch(elementModule(e, { coreImport: '../../js/element.js' }), /deprecat/i, e.name);
});

// The mixin against a stand-in base (no DOM): the real one adds a logger, coerceProp and the listener methods.
async function mixin(spec) {
    globalThis.MutationObserver ??= class { constructor(fn) { this.fn = fn; } observe() {} disconnect() {} };
    const { deprecations: make } = await import(`../js/deprecation.js?${Math.random()}`); // a fresh "page": the once-only memory is per module instance
    const Base = class {
        static tag = spec.tag;
        childNodes = [];
        get log() { return createLogger(spec.tag); }
        coerceProp(_n, _d, raw) { return raw; }
        addEventListener() {} connectedCallback() {} disconnectedCallback() {}
    };
    return class extends make(Base, spec) {};
}
const warnings = tag => getLogBuffer().filter(e => e.scope === tag && e.level === 'warn');

test('a deprecated prop warns once per page, as attribute or property, through the logger with what to use instead', async () => {
    clearLogBuffer();
    const El = await mixin(deprecationSpec(withDeprecations()));
    const a = new El(), b = new El();
    const def = { type: 'enum', default: 'accent' };
    a.coerceProp('variant', def, 'ok', true); a.coerceProp('variant', def, 'muted'); b.coerceProp('variant', def, 'ok', true);
    a.coerceProp('variant', def, null, true); // an attribute removed is not a use
    assert.equal(a.coerceProp('count', def, 'x'), 'x', 'another prop is untouched');
    const w = warnings('pk-badge');
    assert.equal(w.length, 1);
    assert.match(w[0].message, /<pk-badge> attribute "variant" is deprecated since 0\.2\.0-alpha\.1 and will be removed in 0\.3\.0-alpha\.1: use "tone" instead/);
    assert.deepEqual(w[0].detail, { deprecated: 'prop:variant', since: D.since, remove: D.remove });
    clearLogBuffer();
});

test('a deprecated event warns when a listener is added, the element when it connects, a slot when it is filled', async () => {
    clearLogBuffer();
    const spec = deprecationSpec({ ...withDeprecations(), deprecated: D });
    const El = await mixin(spec);
    const el = new El();
    el.addEventListener('click', () => {}); // not deprecated
    assert.equal(warnings('pk-badge').length, 0);
    el.addEventListener('pk-old', () => {}); el.addEventListener('pk-old', () => {});
    el.childNodes = [{ nodeType: 1, getAttribute: n => (n === 'slot' ? 'legacy' : null) }, { nodeType: 3, nodeValue: ' ' }];
    el.connectedCallback(); new El().connectedCallback();
    const messages = warnings('pk-badge').map(e => e.message);
    assert.equal(messages.length, 3, messages.join('\n'));
    assert.ok(messages.some(m => /^<pk-badge> event "pk-old" is deprecated/.test(m)));
    assert.ok(messages.some(m => /^<pk-badge> is deprecated since/.test(m)));
    assert.ok(messages.some(m => /^<pk-badge> slot "legacy" is deprecated/.test(m)));
    clearLogBuffer();
});

test('no deprecated item is removed before its remove release: checked against the last release baseline', () => {
    const baseline = { release: '0.2.0', deprecated: [{ item: 'pk-x:prop:old', since: '0.2.0', remove: '0.3.0' }] };
    const stillThere = { elements: ['pk-x', 'pk-x:prop:old'] }, gone = { elements: ['pk-x'] };
    assert.deepEqual(deprecationProblems(baseline, stillThere, '0.2.1'), []);
    assert.deepEqual(deprecationProblems(baseline, gone, '0.3.0'), [], 'removed in the release that announced');
    assert.deepEqual(deprecationProblems(baseline, gone, '0.4.0'), []);
    assert.match(deprecationProblems(baseline, gone, '0.2.1')[0], /pk-x:prop:old was deprecated in 0\.2\.0 for removal in 0\.3\.0, but it is already gone at 0\.2\.1/);
    assert.equal(deprecationProblems(baseline, gone, '0.3.0-alpha.1').length, 1, 'a pre-release of 0.3.0 is before 0.3.0');
    assert.deepEqual(deprecationProblems({ release: null }, gone, '0.1.0'), [], 'a baseline without a list is fine');
    assert.deepEqual(dueForRemoval(baseline.deprecated, '0.2.9'), []);
    assert.equal(dueForRemoval(baseline.deprecated, '0.3.0').length, 1);
});

test('the sources keep the policy against the committed baseline, and what the metas deprecate is part of the surface', () => {
    const baseline = JSON.parse(read('site/scorecard/api.baseline.json'));
    assert.deepEqual(deprecationProblems(baseline, surface(), readVersion()), []);
    const items = new Set(surface().elements);
    for (const d of deprecations()) assert.ok(items.has(d.item), `${d.item} is deprecated in a meta but is not an API item`);
});
