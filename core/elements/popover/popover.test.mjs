// Unit tests for the popover's state machine and markup contract. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextPopoverState } from './popover.js';

test('toggle flips, open opens, everything that dismisses closes', () => {
    assert.equal(nextPopoverState(false, 'toggle'), true);
    assert.equal(nextPopoverState(true, 'toggle'), false);
    assert.equal(nextPopoverState(false, 'open'), true);
    for (const e of ['close', 'escape', 'outside', 'blur', 'confirm']) assert.equal(nextPopoverState(true, e), false, e);
    assert.equal(nextPopoverState(true, 'unknown'), true);
});

test('the template has a trigger slot, a labelled dialog panel, a body slot and the two confirm buttons', () => {
    const html = fs.readFileSync(new URL('./popover.html', import.meta.url), 'utf8');
    assert.match(html, /<slot name="trigger">/);
    assert.match(html, /part="panel" role="dialog" aria-label="\{\{label\}\}"/);
    assert.match(html, /part="body"><slot>/);
    assert.match(html, /data-action="cancel"/);
    assert.match(html, /data-action="confirm"/);
    assert.ok(!/\sstyle=|\son\w+=/.test(html), 'no inline style or handlers');
});

test('the panel is hidden until the open attribute is reflected, and the confirm buttons are touch sized', () => {
    const css = fs.readFileSync(new URL('./popover.css', import.meta.url), 'utf8');
    assert.match(css, /\[part="panel"\]\s*\{\s*display:\s*none/);
    assert.match(css, /:host\(\[open\]\) \[part="panel"\]\s*\{\s*display:\s*block/);
    assert.match(css, /min-height:\s*var\(--touch-target\)/);
});

test('the stylesheet is token-only and respects reduced motion', () => {
    const css = fs.readFileSync(new URL('./popover.css', import.meta.url), 'utf8');
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css));
    assert.match(css, /prefers-reduced-motion/);
});


test('popover: connecting it installs the declarative openers (data-open, data-toggle, data-close) on its document, once', () => {
    const src = fs.readFileSync(new URL('./popover.js', import.meta.url), 'utf8');
    assert.match(src, /import \{ initInvokers \} from '\.\.\/\.\.\/js\/invokers\.js'/);
    assert.match(src, /connected\(\) \{\s*initInvokers\(this\.ownerDocument\)/, 'connected() installs them; initInvokers is idempotent per root');
});
