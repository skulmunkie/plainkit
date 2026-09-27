// The generic shareable-link codec (js/share-link.js), promoted out of the theme editor's theme-share-logic.js (#399).
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShareLink, decodeShareLink, DEFAULT_MAX_HASH, DEFAULT_MAX_DECODED } from '../js/share-link.js';

test('a link round-trips compressed and plain, and the compressed one is shorter for a bigger payload', async () => {
    const payload = JSON.stringify({ filter: 'active', tags: Array.from({ length: 30 }, (_, i) => `tag-${i}`) });
    const z = await encodeShareLink('pk-demo', payload);
    const p = await encodeShareLink('pk-demo', payload, { compress: false });
    assert.ok(z.hash.startsWith('pk-demo=z.') && p.hash.startsWith('pk-demo=p.'));
    assert.ok(z.compressed && !p.compressed);
    assert.ok(z.hash.length < p.hash.length, `${z.hash.length} < ${p.hash.length}`);
    assert.equal((await decodeShareLink('pk-demo', z.hash)).value, payload);
    assert.equal((await decodeShareLink('pk-demo', p.hash)).value, payload);
    assert.equal((await decodeShareLink('pk-demo', `#${z.hash}`)).value, payload, 'with the #');
    assert.equal((await decodeShareLink('pk-demo', `https://example.test/app/?x=1#${p.hash}`)).value, payload, 'a whole URL');
});

test('a validator turns the decoded text into the caller\'s shape, or refuses it', async () => {
    const r = await encodeShareLink('pk-demo', JSON.stringify({ ok: true }));
    const good = await decodeShareLink('pk-demo', r.hash, { validate: text => JSON.parse(text) });
    assert.deepEqual(good.value, { ok: true });
    const refused = await decodeShareLink('pk-demo', r.hash, { validate: () => ({ error: 'nope' }) });
    assert.equal(refused.error, 'nope');
    const thrown = await decodeShareLink('pk-demo', r.hash, { validate: () => { throw new Error('bad shape'); } });
    assert.match(thrown.error, /bad shape/);
});

test('a payload over maxHash is refused with a caller-chosen message, and nothing is returned', async () => {
    const big = JSON.stringify({ big: 'x'.repeat(1000) });
    const r = await encodeShareLink('pk-demo', big, { maxHash: 100, compress: false });
    assert.match(r.error, /too large for a link/);
    assert.equal(r.hash, undefined);
    const custom = await encodeShareLink('pk-demo', big, { maxHash: 100, compress: false, tooLarge: (length, max) => `nope: ${length}/${max}` });
    assert.equal(custom.error, `nope: ${r.error.match(/\((\d+) of/)[1]}/100`);
    assert.ok(DEFAULT_MAX_HASH >= 2000);
});

test('bad links are errors with a sentence, never an exception', async () => {
    for (const bad of [undefined, null, '', 'hello', '#other=z.abc', 'pk-demo=', 'pk-demo=q.abc', 'pk-demo=p.***', `pk-demo=p.${'A'.repeat(DEFAULT_MAX_HASH)}`, 'pk-demo=z.notdeflate', 'pk-demo=z.AAAA']) {
        const r = await decodeShareLink('pk-demo', bad);
        assert.ok(r.error && !r.value, String(bad).slice(0, 40));
    }
});

test('a small compressed link cannot expand past the cap (a zip bomb is refused)', async () => {
    const bomb = Buffer.from(await new Response(new Blob(['x'.repeat(DEFAULT_MAX_DECODED * 20)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    assert.ok(bomb.length < DEFAULT_MAX_HASH, `the bomb is ${bomb.length} bytes`);
    const r = await decodeShareLink('pk-demo', `pk-demo=z.${bomb.toString('base64url')}`);
    assert.match(r.error, /expands to more than/);
});
