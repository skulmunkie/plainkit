// Contract checks for the menu-item element: template, stylesheet and meta API describe the same thing. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// #1331: a menu item with an href follows it as a link click (a client router, such as Blazor's, then navigates without a reload), never with location.assign.
test('menu-item follows its href through an anchor click, not location.assign', () => {
    const src = readFileSync(new URL('./menu-item.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /location\.assign/);
    assert.match(src, /createElement\('a'\)[\s\S]*a\.click\(\)/);
});
