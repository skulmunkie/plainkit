// Unit tests for the gallery element's decisions: the frame address built from its attributes and which messages may set its height.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { frameUrl, reportedHeight, isReady } from './gallery.js';

const BASE = 'https://cdn.example/sdk/dist/gallery/embed.html';
const query = url => Object.fromEntries(new URL(url).searchParams);

test('the frame shows content only unless chrome is asked for, and carries every narrowing attribute', () => {
    const u = frameUrl({ kind: 'controls', group: 'Forms & inputs', control: 'input, select', theme: 'light', width: 'phone', filter: 'a b', chrome: 'none' }, BASE);
    assert.ok(u.startsWith(`${BASE}?`));
    assert.deepEqual(query(u), { chrome: 'none', kind: 'controls', group: 'forms-inputs', control: 'input,select', theme: 'light', width: 'phone', filter: 'a b' });
    assert.equal(query(frameUrl({}, BASE)).chrome, 'none');
    assert.equal(query(frameUrl({ chrome: 'full' }, BASE)).chrome, 'full');
});

test('theme auto and a height are left out of the address, so they never reload the frame', () => {
    assert.equal(query(frameUrl({ theme: 'auto' }, BASE)).theme, undefined);
    assert.equal(frameUrl({ height: 300 }, BASE), frameUrl({ height: 900 }, BASE));
});

test('src replaces the default address', () => {
    assert.ok(frameUrl({ src: 'https://other.example/x/embed.html', kind: 'elements' }, BASE).startsWith('https://other.example/x/embed.html?'));
});

test('a relative src resolves against document.baseURI, not the page address (a routed page has a different base)', () => {
    const was = { document: globalThis.document, location: globalThis.location };
    try {
        globalThis.location = { href: 'https://app.example/_plainkit/gallery' };
        globalThis.document = { baseURI: 'https://app.example/' };
        assert.ok(frameUrl({ src: 'assets/gallery/embed.html' }, BASE).startsWith('https://app.example/assets/gallery/embed.html?'));
        assert.ok(frameUrl({ src: 'https://other.example/x/embed.html' }, BASE).startsWith('https://other.example/x/embed.html?'), 'an absolute address is untouched');
        assert.ok(frameUrl({}, BASE).startsWith(`${BASE}?`), 'the default is already absolute');
        globalThis.document = undefined;
        assert.ok(frameUrl({ src: 'embed.html' }, BASE).startsWith('https://app.example/_plainkit/embed.html?'), 'without a document it falls back to the location');
    } finally { globalThis.document = was.document; globalThis.location = was.location; }
});

test('sections never reach the frame address (they go by message)', () => {
    assert.equal(frameUrl({ sections: '[{"title":"A"}]' }, BASE), frameUrl({}, BASE));
});

test('only the ready message of the gallery from this frame lets the element send its sections', () => {
    const frame = {}; const origin = 'https://cdn.example';
    const msg = (data, over = {}) => ({ source: frame, origin, data, ...over });
    assert.equal(isReady(msg({ type: 'pk-gallery-ready' }), frame, origin), true);
    assert.equal(isReady(msg({ type: 'pk-gallery-ready' }, { source: {} }), frame, origin), false);
    assert.equal(isReady(msg({ type: 'pk-gallery-ready' }, { origin: 'https://evil.example' }), frame, origin), false);
    assert.equal(isReady(msg({ type: 'pk-gallery-height', height: 1 }), frame, origin), false);
    assert.equal(isReady(msg(null), frame, origin), false);
});

test('only a sane height message from the element\'s own frame is accepted', () => {
    const frame = {}; const origin = 'https://cdn.example';
    const msg = (data, over = {}) => ({ source: frame, origin, data, ...over });
    assert.equal(reportedHeight(msg({ type: 'pk-gallery-height', height: 412.2 }), frame, origin), 413);
    assert.equal(reportedHeight(msg({ type: 'pk-gallery-height', height: 412 }, { source: {} }), frame, origin), 0, 'another window');
    assert.equal(reportedHeight(msg({ type: 'pk-gallery-height', height: 412 }, { origin: 'https://evil.example' }), frame, origin), 0, 'another origin');
    assert.equal(reportedHeight(msg({ type: 'something-else', height: 412 }), frame, origin), 0);
    for (const height of [0, -5, NaN, 'tall', 1e9, undefined]) assert.equal(reportedHeight(msg({ type: 'pk-gallery-height', height }), frame, origin), 0, String(height));
    assert.equal(reportedHeight(msg(null), frame, origin), 0);
});

test('the stylesheet uses tokens only and sizes the frame from its property', () => {
    const css = fs.readFileSync(new URL('./gallery.css', import.meta.url), 'utf8');
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css), 'no literal colours');
    assert.match(css, /block-size:\s*var\(--pk-gallery-height/);
});
