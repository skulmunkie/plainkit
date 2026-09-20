// Unit tests for the scroll aids. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollProgress, showBackToTop, scrollBehavior, skipTarget, edgeState, scrollStepPx, revealLeft } from '../js/scroll-aids.js';

test('an overflowing strip reports which edges hide content, and how far a button moves it', () => {
    assert.deepEqual(edgeState(0, 900, 300), { start: false, end: true });
    assert.deepEqual(edgeState(300, 900, 300), { start: true, end: true });
    assert.deepEqual(edgeState(600, 900, 300), { start: true, end: false });
    assert.deepEqual(edgeState(0, 300, 300), { start: false, end: false });
    assert.deepEqual(edgeState(-600, 900, 300), { start: true, end: false }, 'rtl scrollLeft is negative');
    assert.equal(scrollStepPx(300), 240);
    assert.equal(scrollStepPx(0), 1);
});

test('revealing an item scrolls the least distance that shows it with a margin', () => {
    assert.equal(revealLeft(500, 100, 300, 0), 308);
    assert.equal(revealLeft(20, 100, 300, 200), 12);
    assert.equal(revealLeft(50, 100, 300, 0), 0 + 0, 'already visible: unchanged');
});

test('progress is the scrolled fraction of the scrollable distance, clamped, zero when nothing scrolls', () => {
    assert.equal(scrollProgress(0, 2000, 500), 0);
    assert.equal(scrollProgress(750, 2000, 500), 0.5);
    assert.equal(scrollProgress(1500, 2000, 500), 1);
    assert.equal(scrollProgress(1700, 2000, 500), 1);
    assert.equal(scrollProgress(-20, 2000, 500), 0);
    assert.equal(scrollProgress(0, 400, 500), 0);
});

test('back-to-top appears only past the threshold', () => {
    assert.equal(showBackToTop(100), false);
    assert.equal(showBackToTop(401), true);
    assert.equal(showBackToTop(150, 100), true);
});

test('reduced motion turns smooth scrolling off', () => {
    assert.equal(scrollBehavior(true), 'auto');
    assert.equal(scrollBehavior(false), 'smooth');
});

test('a skip link only ever targets a fragment on the same page', () => {
    assert.equal(skipTarget('#main'), 'main');
    assert.equal(skipTarget('#main-content'), 'main-content');
    assert.equal(skipTarget('https://example.com/#main'), null);
    assert.equal(skipTarget('/other#main'), null);
    assert.equal(skipTarget('#'), null);
    assert.equal(skipTarget(null), null);
});
