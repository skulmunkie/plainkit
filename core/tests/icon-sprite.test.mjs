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

test('a <meta name="pk-icons"> in the page sets the sprite address once, at import (#1808)', async () => {
    globalThis.document = { querySelector: s => (s === 'meta[name="pk-icons"]' ? { content: '/assets/plainkit-icons.svg' } : null) };
    try {
        const m = await import('../js/icon-sprite.js?pk-icons-meta'); // a fresh module instance that reads the stub
        assert.equal(m.spriteUrl(), '/assets/plainkit-icons.svg');
        assert.equal(m.iconHref('plus'), '/assets/plainkit-icons.svg#plus');
    } finally { delete globalThis.document; }
    assert.equal(spriteUrl('https://x.test/sdk/js/icon-sprite.js'), 'https://x.test/sdk/icons.svg', 'without the meta nothing changes');
});

test('an unloadable sprite warns once per page with the install hint, never throws and reports no names', async () => {
    const { addLogSink } = await import('../js/log.js');
    const m = await import('../js/icon-sprite.js?pk-missing'); // a fresh module: its own once-per-page sprite read
    const realFetch = globalThis.fetch; globalThis.fetch = () => Promise.resolve({ ok: false, status: 404 });
    const seen = []; addLogSink(e => { if (e.scope === 'icon-sprite') seen.push(e); });
    try {
        const u = use(), warned = [];
        m.drawIcon(u, 'plus', k => warned.push(k));
        m.drawIcon(use(), 'search', k => warned.push(k));
        await new Promise(r => setTimeout(r, 20));
        m.drawIcon(use(), 'minus', k => warned.push(k));
        await new Promise(r => setTimeout(r, 20));
        assert.equal(seen.filter(e => e.level === 'warn').length, 1, 'exactly one warning');
        assert.match(seen[0].message, /could not be loaded from .*icons\.svg.*plainkit\.icons.*pk-icons/);
        assert.deepEqual(warned, [], 'no per-name report when the sprite is absent');
        assert.equal(u.getAttribute('href'), m.iconHref('plus'), 'the reference is still set; the browser draws nothing for it');
    } finally { globalThis.fetch = realFetch; }
});
