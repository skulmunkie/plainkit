import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spriteUrl, iconHref } from './icon.js';

test('spriteUrl finds icons.svg from the source layout and from the dist layout', () => {
    assert.equal(spriteUrl('https://x.test/sdk/elements/icon/icon.element.js'), 'https://x.test/sdk/icons.svg');
    assert.equal(spriteUrl('https://x.test/cdn/v1/elements/icon.js'), 'https://x.test/cdn/v1/icons.svg');
});
test('iconHref addresses one symbol and gives nothing for an empty name', () => {
    assert.equal(iconHref('search', 'https://x.test/icons.svg'), 'https://x.test/icons.svg#search');
    assert.equal(iconHref('  ', 'https://x.test/icons.svg'), '');
    assert.equal(iconHref(undefined, 'https://x.test/icons.svg'), '');
});
test('the sprite the element points at exists and the example icons are in it', () => {
    const sprite = fs.readFileSync(new URL('../../icons.svg', import.meta.url), 'utf8');
    for (const id of ['search', 'settings', 'orders']) assert.ok(sprite.includes(`id="${id}"`), id);
});
