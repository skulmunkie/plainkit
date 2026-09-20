// Unit tests for the tooltip's decisions and markup contract. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { showDelay, DEFAULT_DELAY, LONG_PRESS } from './tooltip.js';

test('focus shows at once, touch waits for a long press, mouse uses the configured delay', () => {
    assert.equal(showDelay('focus', 900), 0);
    assert.equal(showDelay('touch', 0), LONG_PRESS);
    assert.equal(showDelay('hover', 250), 250);
});

test('a missing or bad delay falls back to the default', () => {
    assert.equal(showDelay('hover', NaN), DEFAULT_DELAY);
    assert.equal(showDelay('hover', -5), DEFAULT_DELAY);
    assert.equal(showDelay('hover'), DEFAULT_DELAY);
});

test('the stylesheet uses tokens only and keeps reading-size text', () => {
    const css = fs.readFileSync(new URL('./tooltip.css', import.meta.url), 'utf8');
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css), 'no literal colours');
    assert.match(css, /font-size:\s*var\(--text-read\)/);
    assert.match(css, /pointer-events:\s*none/);
});

