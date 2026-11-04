import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./quote.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));

test('the quote stays visible before it upgrades, is tier element and renders no pk-* element', () => {
    assert.equal(meta.preUpgrade, 'visible');
    assert.equal(meta.tier, 'element');
    assert.ok(!/pk-[a-z]/.test(read('html') + read('js')));
});

test('the template is a figure with a figcaption around the default slot, and the host never writes to its children', () => {
    const html = read('html');
    assert.match(html, /<figure part="figure"><slot><\/slot><figcaption part="caption">/);
    for (const s of ['portrait', 'name', 'role', 'rating']) assert.ok(html.includes(`<slot name="${s}">`), s);
    assert.ok(!/(?:setAttribute|append|remove|innerHTML)\b/.test(read('js').replace(/link\.(?:setAttribute|removeAttribute)/g, '')), 'no write to light DOM');
});

test('cite is checked with safeHref', () => {
    assert.match(read('js'), /safeHref\(this\.cite\)/);
});
