// Unit tests for the image gallery's pure logic: cleaning the list, the primary index, what a removal does, the column rule.
// The DOM behaviour (tiles, badge, events, lightbox) is in tests/browser/cases-workspace.js. Run: node --test core
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, primaryIndex, applyPrimary, removeAt, gridRule, safeSrc, DEFAULT_MIN } from './image-gallery.js';

const three = normalize([{ src: 'a.png', alt: 'A' }, { src: 'b.png', alt: 'B', status: 'Staged' }, { src: 'c.png' }]);

test('image gallery: the list is cleaned: only objects with a string src, every field defaulted', () => {
    assert.deepEqual(normalize([{ src: 'a.png', primary: true }, null, 'x', { alt: 'no src' }, { src: 4 }]), [{ src: 'a.png', alt: '', status: '', primary: true }]);
    assert.deepEqual(normalize(undefined), []);
    assert.equal(three[2].alt, '');
    assert.equal(three[1].status, 'Staged');
});

test('image gallery: a valid primary index wins over the flags; otherwise the first flagged image; otherwise none', () => {
    const flagged = normalize([{ src: 'a' }, { src: 'b', primary: true }, { src: 'c', primary: true }]);
    assert.equal(primaryIndex(flagged, -1), 1);
    assert.equal(primaryIndex(flagged, 2), 2);
    assert.equal(primaryIndex(flagged, 9), 1, 'out of range falls back to the flags');
    assert.equal(primaryIndex(three, -1), -1);
    assert.equal(primaryIndex([], 0), -1);
});

test('image gallery: applyPrimary leaves exactly one image flagged, and none for -1', () => {
    assert.deepEqual(applyPrimary(three, 1).map(i => i.primary), [false, true, false]);
    assert.deepEqual(applyPrimary(applyPrimary(three, 1), -1).map(i => i.primary), [false, false, false]);
    assert.equal(three[1].primary, false, 'the input is not changed');
});

test('image gallery: removing an image keeps the primary on the same picture, and the first image takes over when it was the primary', () => {
    assert.equal(removeAt(three, 0, 2).primary, 1, 'an earlier image goes: the index shifts');
    assert.equal(removeAt(three, 2, 0).primary, 0, 'a later image goes: unchanged');
    const gone = removeAt(three, 1, 1);
    assert.equal(gone.primary, 0);
    assert.deepEqual(gone.images.map(i => [i.src, i.primary]), [['a.png', true], ['c.png', false]]);
    assert.equal(removeAt(three, 1, -1).primary, -1, 'no primary stays none');
    const last = removeAt(normalize([{ src: 'a' }]), 0, 0);
    assert.deepEqual([last.images.length, last.primary], [0, -1]);
    assert.equal(removeAt(three, 7, 1).images, three, 'an index that does not exist changes nothing');
});

test('image gallery: the column rule uses fixed columns, or as many as fit a plain css length', () => {
    assert.deepEqual(gridRule(3, '10rem'), { cols: '3', min: '0px' });
    assert.deepEqual(gridRule(99, ''), { cols: '12', min: '0px' });
    assert.deepEqual(gridRule(0, '8rem'), { cols: 'auto-fill', min: '8rem' });
    assert.deepEqual(gridRule(0, '120px'), { cols: 'auto-fill', min: '120px' });
    assert.equal(gridRule(0, 'calc(1px); x').min, DEFAULT_MIN, 'anything but a plain length is refused');
    assert.equal(gridRule(-2, undefined).min, DEFAULT_MIN);
});

test('image gallery: only safe image sources are shown', () => {
    assert.equal(safeSrc('/img/a.png'), '/img/a.png');
    assert.equal(safeSrc('https://example.com/a.png'), 'https://example.com/a.png');
    assert.match(safeSrc('data:image/png;base64,AAAA'), /^data:image\/png/);
    assert.equal(safeSrc('java' + 'script:alert(1)'), null);
    assert.equal(safeSrc('data:image/svg+xml,<svg/>'), null);
    assert.equal(safeSrc('  '), null);
    assert.equal(safeSrc(5), null);
});

// Performance guard (audit #106): a gallery of hundreds of images must not fetch them all at once.
test('image gallery: thumbnails load lazily and decode off the main thread', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('./image-gallery.html', import.meta.url), 'utf8');
    const img = /<img\b[^>]*>/.exec(html)?.[0] ?? '';
    assert.match(img, /loading="lazy"/);
    assert.match(img, /decoding="async"/);
});
