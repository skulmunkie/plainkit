import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./cta-band.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));

test('the band stays visible before it upgrades, is tier element and renders no pk-* element', () => {
    assert.equal(meta.preUpgrade, 'visible');
    assert.equal(meta.tier, 'element');
    assert.ok(!/pk-(?!cta-band)[a-z]/.test(read("html") + read("js")));
});

test('the template slots the author heading, text and actions, and the element never writes to its children', () => {
    const html = read('html');
    for (const s of ['<slot name="heading">', '<slot></slot>', '<slot name="actions">']) assert.ok(html.includes(s), s);
    assert.ok(!/(?:setAttribute|append|remove|innerHTML|textContent)\b/.test(read('js')), 'no write to light DOM');
});

test('a missing heading is warned about once, not invented', () => {
    assert.match(read('js'), /warnOnce\('heading'/);
});
