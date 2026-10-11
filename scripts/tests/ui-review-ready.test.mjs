// The review page measures only after every custom element, shadow trees included, is defined (issue: a pk-lookup-picker chevron measured 0x19 now and then,
// because pk-icon inside the picker's shadow tree was loaded after the picker itself was defined).
import test from 'node:test';
import assert from 'node:assert/strict';
import { undefinedTags, whenUpgraded } from '../../core/tests/review/ready.js';

// a tiny tree: querySelectorAll('*') returns every descendant in the light tree; a host's shadow root is a separate tree
const tree = (...items) => ({
    querySelectorAll: sel => (sel === '*' ? items : []),
    querySelector: tag => items.find(i => i.localName === tag) ?? null,
});
const el = (localName, shadowItems = null) => ({ localName, shadowRoot: shadowItems ? tree(...shadowItems) : null });

test('undefinedTags descends into shadow roots', () => {
    const picker = el('pk-lookup-picker', [el('pk-button'), el('pk-icon'), el('span')]);
    const root = tree(picker);
    const defined = new Set(['pk-lookup-picker']);
    assert.deepEqual(undefinedTags(root, t => defined.has(t)).sort(), ['pk-button', 'pk-icon']);
    defined.add('pk-button'); defined.add('pk-icon');
    assert.deepEqual(undefinedTags(root, t => defined.has(t)), []);
});

test('whenUpgraded loads the shadow root that holds the undefined tag and waits until it is defined', async () => {
    const picker = el('pk-lookup-picker', [el('pk-icon')]);
    const root = tree(picker);
    const defined = new Set(['pk-lookup-picker']);
    const loaded = [];
    const left = await whenUpgraded(root, {
        isDefined: t => defined.has(t),
        load: async r => { loaded.push(r === picker.shadowRoot); setTimeout(() => defined.add('pk-icon'), 20); },
        whenDefined: () => new Promise(r => setTimeout(r, 30)),
        pause: ms => new Promise(r => setTimeout(r, ms)),
    });
    assert.deepEqual(left, []);
    assert.ok(loaded.includes(true), 'the picker shadow root was handed to the loader');
});

test('whenUpgraded gives up after the limit and names the tags', async () => {
    const root = tree(el('pk-ghost'));
    const warned = [];
    const left = await whenUpgraded(root, { isDefined: () => false, whenDefined: () => new Promise(() => {}), pause: ms => new Promise(r => setTimeout(r, ms)), limit: 120, log: { warn: m => warned.push(m) } });
    assert.deepEqual(left, ['pk-ghost']);
    assert.match(warned[0], /pk-ghost/);
});
