// The PkElement surface is frozen (core/STANDARDS.md, "Ownership and reactivity", rules 8 to 10): the reactive core is "attributes and
// properties in, one microtask-batched render, events out". A new lifecycle hook, a new base-class method or a richer template syntax is
// a design decision, not a drive-by change: it fails here on purpose, so the change has to update STANDARDS.md and this list together.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBindings, bindValue } from '../js/element-core.js';

globalThis.HTMLElement ??= class {};
const el = await import('../js/element.js');
const core = await import('../js/element-core.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const POINTER = 'See core/STANDARDS.md, "Ownership and reactivity" (rules 8 to 10): the reactive core stays attributes/properties in, one microtask-batched render, events out. Adding to it is a design decision: update that section and this list in the same change.';

test('the PkElement methods, accessors and statics are exactly the frozen list', () => {
    assert.deepEqual(Object.getOwnPropertyNames(el.PkElement.prototype).sort(), [
        'aria', 'attributeChangedCallback', 'checkValidity', 'coerceProp', 'connectedCallback', 'constructor', 'debug', 'disconnectedCallback',
        'emit', 'form', 'formDisabledCallback', 'formResetCallback', 'formStateRestoreCallback', 'log', 'part', 'render', 'requestUpdate',
        'setFormValue', 'setValidity', 'slotted', 'update', 'validationMessage', 'validity', 'warnOnce', 'watchSlot',
    ], POINTER);
    assert.deepEqual(Object.getOwnPropertyNames(el.PkElement).filter(n => !['length', 'name', 'prototype'].includes(n)).sort(), ['css', 'delegatesFocus', 'observedAttributes', 'props', 'template'], POINTER);
    assert.deepEqual(Object.keys(el).sort(), ['PkElement', 'RESET', 'bindValue', 'camel', 'coerce', 'define', 'kebab', 'parseBindings', 'sheetFor'], POINTER);
    assert.deepEqual(Object.keys(core).sort(), ['bindValue', 'camel', 'coerce', 'kebab', 'parseBindings'], POINTER);
});

test('the lifecycle hooks the base class calls on an element are exactly: connected, disconnected, changed, updated, onReset, onRestore', () => {
    const hooks = [...strip(source('js/element.js')).matchAll(/this\.(\w+)\?\.\(/g)].map(m => m[1]).filter(n => n !== 'attachInternals');
    assert.deepEqual([...new Set(hooks)].sort(), ['changed', 'connected', 'disconnected', 'onReset', 'onRestore', 'updated'], `a new hook (or a removed one) was added to element.js. ${POINTER}`);
});

test('the template syntax is interpolation and data-if / data-if-not, and nothing else', () => {
    // {{ name }} and {{ name|str }} (a dotted key is a plain key): everything else stays literal text
    assert.deepEqual(parseBindings('a {{x}} b {{ y.z|str }}'), ['a ', { key: 'x', str: false }, ' b ', { key: 'y.z', str: true }], POINTER);
    for (const literal of ['{{#if x}}', '{{a + b}}', '{{a ? b : c}}', '{{fn(x)}}', '{{x | upper}}', '{{a && b}}', '{{ !x }}', '{{a[0]}}']) {
        assert.deepEqual(parseBindings(literal), [literal], `${literal} must not become a binding. ${POINTER}`);
    }
    assert.equal(bindValue(parseBindings('{{a}}-{{b}}'), { a: 1, b: 2 }), '1-2');
    // the only special attributes the constructor binds
    const attrs = [...strip(source('js/element.js')).matchAll(/'(data-[\w-]+)'/g)].map(m => m[1]);
    assert.deepEqual([...new Set(attrs)].sort(), ['data-if', 'data-if-not'], `a new template attribute was added. ${POINTER}`);
    assert.match(source('js/element-core.js'), /\/\\\{\\\{\\s\*\(\[\\w\.\]\+\)\(\\\|str\)\?\\s\*\\\}\\\}\/g/, `the {{ }} pattern changed. ${POINTER}`);
});

test('rendering stays one microtask-batched update: no other scheduler, tracker or effect in the base runtime', () => {
    const text = strip(source('js/element.js')) + strip(source('js/element-core.js'));
    assert.equal((text.match(/queueMicrotask\(/g) ?? []).length, 1, POINTER);
    for (const banned of [/\bProxy\b/, /\bSignal\b/i, /\beffect\b/i, /\bcomputed\b/i, /\bsubscribe\b/i, /\bWeakRef\b/, /FinalizationRegistry/, /\brequestAnimationFrame\b/, /\bMutationObserver\b/, /\bsetInterval\b/]) {
        assert.ok(!banned.test(text), `${banned} appeared in the base runtime. ${POINTER}`);
    }
});
