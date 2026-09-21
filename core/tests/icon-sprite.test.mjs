import test from 'node:test';
import assert from 'node:assert/strict';
import { drawIcon, iconHref, spriteUrl, symbolIds } from '../js/icon-sprite.js';

const use = () => { const a = new Map(); return { getAttribute: k => a.get(k) ?? null, setAttribute: (k, v) => a.set(k, v), removeAttribute: k => a.delete(k) }; };

test('spriteUrl resolves from js/, the source element folder and the dist element folder', () => {
    assert.equal(spriteUrl('https://x.test/sdk/js/icon-sprite.js'), 'https://x.test/sdk/icons.svg');
    assert.equal(spriteUrl('https://x.test/sdk/elements/icon/icon.element.js'), 'https://x.test/sdk/icons.svg');
    assert.equal(spriteUrl('https://x.test/cdn/elements/button.js'), 'https://x.test/cdn/icons.svg');
});

test('symbolIds reads the ids of the symbols in a sprite', () => {
    assert.deepEqual([...symbolIds('<svg><symbol id="a" viewBox="0 0 1 1"/><symbol viewBox="0 0 1 1" id="b"/></svg>')].sort(), ['a', 'b']);
});

test('drawIcon points the use at the symbol, reports a missing name once through warnOnce and clears an empty name', async () => {
    const realFetch = globalThis.fetch; globalThis.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('<symbol id="plus"/>') });
    try {
        const u = use(); const warned = [];
        drawIcon(u, ' plus ', k => warned.push(k));
        assert.equal(u.getAttribute('href'), iconHref('plus'));
        drawIcon(u, 'nope', k => warned.push(k));
        await new Promise(r => setTimeout(r, 10));
        assert.deepEqual(warned, ['name:nope']);
        drawIcon(u, '', () => assert.fail('an empty name is not reported'));
        assert.equal(u.getAttribute('href'), null);
    } finally { globalThis.fetch = realFetch; }
});
