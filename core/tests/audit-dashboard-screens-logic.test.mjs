import test from 'node:test';
import assert from 'node:assert/strict';
import { isShotFile, screenShots, itemOf, shotItems, filterShots, sortShots, shotStatus, galleryImages, findingRows, countText } from '../modules/audit-dashboard/screens-logic.js';

const shot = (tag, example, viewport, theme, findings = [], extra = {}) => ({ tag, example, title: 't', viewport, theme, file: `${tag}__${String(example).padStart(2, '0')}__${viewport}__${theme}.png`, findings, ...extra });
const SHOTS = [
    shot('pk-card', 1, 'phone', 'dark'), shot('pk-card', 1, 'desktop', 'light'), shot('pk-card', 1, 'desktop', 'dark', [{ rule: 'overflow', severity: 'error', message: 'wide', fix: 'wrap' }]),
    shot('pk-tabs', 2, 'phone', 'light', [{ rule: 'contrast', severity: 'warning', message: 'low' }]),
    shot('pk-dock', 'rest', 'desktop', 'light', [], { scenario: 'dock-open', file: 'scenario-dock-open__rest__desktop__light.png' }),
    { tag: 'pk-x', viewport: 'phone', theme: 'light', file: '../evil.png' },
];

test('only plain png names are shots: a path, a leading dot or another type is dropped', () => {
    assert.ok(isShotFile('pk-card__01__desktop__light.png'));
    for (const f of ['../a.png', 'a/b.png', '.a.png', 'a.txt', '', null, 'a\\b.png']) assert.equal(isShotFile(f), false, String(f));
    assert.equal(screenShots({ shots: SHOTS }).length, 5);
    assert.deepEqual(screenShots({}), []);
    assert.deepEqual(screenShots(null), []);
});

test('items list elements then scenarios, and the filters combine', () => {
    const shots = screenShots({ shots: SHOTS });
    assert.deepEqual(shotItems(shots), ['pk-card', 'pk-tabs', 'scenario dock-open']);
    assert.equal(itemOf(shots[4]), 'scenario dock-open');
    assert.equal(filterShots(shots, { item: 'pk-card' }).length, 3);
    assert.equal(filterShots(shots, { item: 'pk-card', viewport: 'desktop' }).length, 2);
    assert.equal(filterShots(shots, { theme: 'dark', viewport: 'desktop' }).length, 1);
    assert.equal(filterShots(shots, { onlyFindings: true }).length, 2);
    assert.equal(filterShots(shots).length, 5);
});

test('shots sort with the four variants of an example together, desktop before phone, light before dark', () => {
    const order = sortShots(filterShots(screenShots({ shots: SHOTS }), { item: 'pk-card' })).map(s => `${s.viewport}/${s.theme}`);
    assert.deepEqual(order, ['desktop/light', 'desktop/dark', 'phone/dark']);
});

test('status, gallery images and finding rows', () => {
    const shots = screenShots({ shots: SHOTS });
    assert.equal(shotStatus(shots[0]), '');
    assert.equal(shotStatus(shots[2]), '1 error');
    assert.equal(shotStatus(shots[3]), '1 warning');
    const imgs = galleryImages([shots[1]], '/_audit/review/');
    assert.deepEqual(imgs[0], { src: '/_audit/review/pk-card__01__desktop__light.png', alt: 'pk-card example 1, desktop, light', status: '' });
    const rows = findingRows(shots);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { id: '2.0', shot: 'pk-card example 1, desktop, dark', severity: 'error', rule: 'overflow', message: 'wide', fix: 'FIX: wrap' });
    assert.equal(rows[1].fix, '');
    assert.equal(countText(2, 5), '2 of 5 screenshots shown');
});
