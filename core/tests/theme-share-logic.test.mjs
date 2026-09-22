// Export snippet and shareable links (js/theme-share-logic.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyOverrides, overrideCount } from '../js/theme-editor-logic.js';
import { generatePalette } from '../js/brand-palette-logic.js';
import { presetOverrides } from '../js/theme-presets-logic.js';
import { buildSnippet, encodeShare, decodeShare, SHARE_KEY, MAX_HASH, MAX_DECODED } from '../js/theme-share-logic.js';

const small = { shared: { '--radius-md': '4px' }, dark: { '--color-accent': '#111111' }, light: { '--color-accent': '#222222' } };

test('the snippet is the override CSS under a header comment: :root and [data-theme] blocks, nothing else', () => {
    const s = buildSnippet(small);
    assert.match(s, /^\/\* Plainkit theme: 3 token overrides\./);
    assert.match(s, /--color-accent:\s*#111111/); assert.match(s, /\[data-theme="light"\]/);
    assert.ok(!/<|>/.test(s.replace(/\/\*[\s\S]*?\*\//, '')), 'text only');
    assert.match(buildSnippet({ shared: { '--a-b': '1' }, dark: {}, light: {} }), /1 token override\./);
});

test('a link round-trips compressed and plain, and the compressed one is shorter for a real theme', async () => {
    const big = generatePalette('#e11d74', { warn: '#c2410c' }).overrides;
    const z = await encodeShare(big), p = await encodeShare(big, { compress: false });
    assert.ok(z.hash.startsWith(`${SHARE_KEY}=z.`) && p.hash.startsWith(`${SHARE_KEY}=p.`));
    assert.ok(z.compressed && !p.compressed);
    assert.ok(z.hash.length < p.hash.length, `${z.hash.length} < ${p.hash.length}`);
    assert.deepEqual((await decodeShare(z.hash)).overrides, big);
    assert.deepEqual((await decodeShare(p.hash)).overrides, big);
    assert.deepEqual((await decodeShare(`#${z.hash}`)).overrides, big, 'with the #');
    assert.deepEqual((await decodeShare(`https://example.test/site/theme/?x=1#${p.hash}`)).overrides, big, 'a whole URL');
    assert.equal(/[^A-Za-z0-9_=.-]/.test(z.hash), false, 'URL-safe characters only');
});

test('an empty theme is nothing to share, a theme over the size limit says so, and neither makes a link', async () => {
    assert.ok((await encodeShare(emptyOverrides())).error);
    const huge = { shared: {}, dark: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`--t-${i}`, `#${(i * 2654435761 >>> 0).toString(16).padStart(8, '0').slice(0, 6)}`])), light: {} };
    const r = await encodeShare(huge, { compress: false });
    assert.match(r.error ?? '', /too large for a link/); assert.equal(r.hash, undefined);
    assert.ok(MAX_HASH >= 2000);
});

test('the presets fit in a link', async () => {
    for (const id of ['high-contrast', 'compact', 'roomy']) {
        const r = await encodeShare(presetOverrides(id));
        assert.ok(r.hash, `${id}: ${r.error}`);
        assert.equal(overrideCount((await decodeShare(r.hash)).overrides), overrideCount(presetOverrides(id)));
    }
});

test('a link is validated like pasted JSON: hostile names and values are dropped or refused, never applied', async () => {
    const b64 = s => Buffer.from(s).toString('base64url');
    const hostile = { shared: { '--a-b': 'url(https://evil.test/x)', '--ok-one': '4px' }, dark: { BAD: 'x', '--x-y': '</style><script>alert(1)</script>' }, light: { '--z-z': 'expression(1)' } };
    const got = await decodeShare(`${SHARE_KEY}=p.${b64(JSON.stringify(hostile))}`);
    assert.deepEqual(got.overrides, { shared: { '--ok-one': '4px' }, dark: {}, light: {} });
    for (const payload of ['{"shared":{"BAD":"x","--a-b":"url(evil)"}}', '<b>hi</b>', 'not json', '[1,2]', '{"foo":1}', '']) assert.ok((await decodeShare(`${SHARE_KEY}=p.${b64(payload)}`)).error, payload);
});

test('bad links are errors with a sentence, never an exception', async () => {
    for (const bad of [undefined, null, '', 'hello', '#other=z.abc', `${SHARE_KEY}=`, `${SHARE_KEY}=q.abc`, `${SHARE_KEY}=p.***`, `${SHARE_KEY}=p.${'A'.repeat(MAX_HASH)}`, `${SHARE_KEY}=z.notdeflate`, `${SHARE_KEY}=z.AAAA`, `${SHARE_KEY}=p.${Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url')}`]) {
        const r = await decodeShare(bad);
        assert.ok(r.error && !r.overrides, String(bad).slice(0, 40));
    }
});

test('a small compressed link cannot expand past the cap (a zip bomb is refused)', async () => {
    const bomb = Buffer.from(await new Response(new Blob(['x'.repeat(MAX_DECODED * 20)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    assert.ok(bomb.length < MAX_HASH, `the bomb is ${bomb.length} bytes`);
    const r = await decodeShare(`${SHARE_KEY}=z.${bomb.toString('base64url')}`);
    assert.match(r.error, /expands to more than/);
});

test('the share format never carries markup and the module exposes no HTML sink for it', () => {
    const module = fs.readFileSync(new URL('../modules/theme-editor/theme-editor.js', import.meta.url), 'utf8');
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(module.replace(/previewFrame\.srcdoc[^\n]*/g, '')), 'no HTML sink in the module beyond the preview frame document');
});
