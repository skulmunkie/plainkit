// Unit tests for the drawer's swipe decisions. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeSide, lockedAxis, dragOffset, shouldClose, swipeOutcome, axisOf } from './drawer.js';

test('an unknown side is a right drawer', () => {
    assert.equal(normalizeSide('top'), 'right');
    assert.equal(normalizeSide('bottom'), 'bottom');
    assert.equal(axisOf('bottom'), 'y');
    assert.equal(axisOf('left'), 'x');
});

test('a drag has no axis until it has moved a few pixels, then takes the larger one', () => {
    assert.equal(lockedAxis(3, 2), null);
    assert.equal(lockedAxis(20, 4), 'x');
    assert.equal(lockedAxis(-2, -30), 'y');
});

test('the panel only follows the finger in the closing direction', () => {
    assert.equal(dragOffset('right', 40, 5), 40);
    assert.equal(dragOffset('right', -40, 5), 0);
    assert.equal(dragOffset('left', -40, 5), 40);
    assert.equal(dragOffset('left', 40, 5), 0);
    assert.equal(dragOffset('bottom', 3, 60), 60);
    assert.equal(dragOffset('bottom', 3, -60), 0);
});

test('releasing past a third of the size closes; a short slow drag does not; a fast flick does', () => {
    assert.equal(shouldClose(120, 300, 900), true);
    assert.equal(shouldClose(60, 300, 900), false);
    assert.equal(shouldClose(60, 300, 80), true);
    assert.equal(shouldClose(0, 300, 10), false);
    assert.equal(shouldClose(5, 300, 1), false);
});

test('a gesture is none, cancel or close', () => {
    assert.equal(swipeOutcome('right', 4, 2, 50, 300), 'none');
    assert.equal(swipeOutcome('right', 150, 10, 300, 300), 'close');
    assert.equal(swipeOutcome('right', 30, 10, 900, 300), 'cancel');
    assert.equal(swipeOutcome('right', 10, 80, 300, 300), 'cancel', 'a vertical scroll is not a swipe');
    assert.equal(swipeOutcome('bottom', 5, 140, 300, 300), 'close');
    assert.equal(swipeOutcome('left', -150, 0, 200, 300), 'close');
});


test('drawer: connecting it installs the declarative openers (data-open, data-toggle, data-close) on its document, once', () => {
    const src = fs.readFileSync(new URL('./drawer.js', import.meta.url), 'utf8');
    assert.match(src, /import \{ initInvokers \} from '\.\.\/\.\.\/js\/invokers\.js'/);
    assert.match(src, /connected\(\) \{\s*initInvokers\(this\.ownerDocument\)/, 'connected() installs them; initInvokers is idempotent per root');
});
