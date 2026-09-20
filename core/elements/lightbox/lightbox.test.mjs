// Unit tests for the lightbox decisions. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, keyDelta, swipeDelta, safeSrc, preloadIndexes, counterText } from './lightbox.js';

test('stepping wraps in both directions and copes with an empty gallery', () => {
    assert.equal(step(0, 3, -1), 2);
    assert.equal(step(2, 3, 1), 0);
    assert.equal(step(1, 3, 1), 2);
    assert.equal(step(0, 0, 1), -1);
});

test('arrow and page keys move the gallery', () => {
    assert.equal(keyDelta('ArrowRight'), 1);
    assert.equal(keyDelta('PageUp'), -1);
    assert.equal(keyDelta('Enter'), null);
});

test('a swipe must be long and mostly horizontal; a left swipe shows the next image', () => {
    assert.equal(swipeDelta(-80, 10), 1);
    assert.equal(swipeDelta(80, 10), -1);
    assert.equal(swipeDelta(20, 0), 0);
    assert.equal(swipeDelta(-80, 70), 0, 'diagonal drags are ignored');
});

test('only same-site paths, http(s) and raster data images are shown', () => {
    assert.equal(safeSrc('img/a.jpg'), 'img/a.jpg');
    assert.equal(safeSrc('https://example.com/a.png'), 'https://example.com/a.png');
    assert.equal(safeSrc('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
    assert.equal(safeSrc('data:image/svg+xml;utf8,<svg/>'), null);
    assert.equal(safeSrc('data:text/html,x'), null);
    assert.equal(safeSrc('java' + 'script:alert(1)'), null);
    assert.equal(safeSrc('   '), null);
});

test('the neighbours are warmed up, without duplicates or the current image', () => {
    assert.deepEqual(preloadIndexes(1, 5), [2, 0]);
    assert.deepEqual(preloadIndexes(0, 2), [1]);
    assert.deepEqual(preloadIndexes(0, 1), []);
});

test('the counter is blank for a single image', () => {
    assert.equal(counterText(0, 1), '');
    assert.equal(counterText(1, 4), '2 / 4');
});

