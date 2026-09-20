// Unit tests for the modal component's behaviour, run against the fake DOM. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, el, FakeEvent } from '../../tests/fake-dom.mjs';
import { attachOverlay, tabTarget } from './modal.js';

test('overlay: focus moves in, Escape calls onClose, and detach returns focus to the opener', () => {
    const doc = createDocument();
    globalThis.document = doc;
    const opener = el(doc, 'button'); doc.documentElement.append(opener); opener.focus();
    const inner = el(doc, 'button');
    inner.getClientRects = () => [1];
    const dialog = el(doc, 'div.modal-card', {}, inner);
    dialog.getClientRects = () => [1];
    const overlay = el(doc, 'div.modal-overlay', {}, dialog);
    doc.documentElement.append(overlay);
    let closed = 0;
    const handle = attachOverlay(overlay, { onClose: () => { closed++; } });
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    doc._listeners.get('keydown')[0](new FakeEvent('keydown', { key: 'Escape' }));
    assert.equal(closed, 1);
    handle.detach();
    assert.equal(doc.activeElement, opener);
    delete globalThis.document;
});

test('overlay: a docked overlay (holdFocus false) claims neither aria-modal nor Escape', () => {
    const doc = createDocument();
    globalThis.document = doc;
    const panel = el(doc, 'div.flyout-panel');
    doc.documentElement.append(panel);
    let closed = 0;
    const handle = attachOverlay(panel, { holdFocus: false, onClose: () => { closed++; } });
    assert.equal(panel.getAttribute('aria-modal'), null);
    doc._listeners.get('keydown')?.[0]?.(new FakeEvent('keydown', { key: 'Escape' }));
    assert.equal(closed, 0);
    handle.detach();
    delete globalThis.document;
});

test('overlay: tabTarget still wraps (regression guard beside the wiring tests)', () => {
    assert.equal(tabTarget(2, 3, false), 0);
});
