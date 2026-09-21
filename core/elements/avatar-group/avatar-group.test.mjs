// Unit tests for pk-avatar-group: overflow hiding, the "+N" tile and the group role. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './avatar-group.js';

const make = (props, count) => {
    const people = Array.from({ length: count }, () => ({ hidden: false })); const more = { hidden: true, textContent: '' }; let watched = 0;
    const El = behaviour(class { slotted() { return people; } part(n) { return n === 'more' ? more : null; } aria(m) { this.ariaSet = m; } watchSlot() { watched++; } requestUpdate() {} });
    const el = new El(); Object.assign(el, props);
    return { el, people, more, watched: () => watched };
};

test('avatars past max are hidden and the tile counts them', () => {
    const { el, people, more } = make({ max: 3, label: 'Team' }, 5);
    el.updated();
    assert.deepEqual(people.map(p => p.hidden), [false, false, false, true, true]);
    assert.equal(more.textContent, '+2'); assert.equal(more.hidden, false);
});

test('when everyone fits the tile is hidden', () => {
    const { el, people, more } = make({ max: 5, label: '' }, 3);
    el.updated();
    assert.ok(people.every(p => !p.hidden));
    assert.equal(more.hidden, true); assert.equal(more.textContent, '+0');
});

test('max 0 hides everyone and shows the full count; an empty group is fine', () => {
    const z = make({ max: 0, label: '' }, 2); z.el.updated();
    assert.ok(z.people.every(p => p.hidden)); assert.equal(z.more.textContent, '+2');
    const e = make({ max: 3, label: '' }, 0);
    assert.doesNotThrow(() => e.el.updated()); assert.equal(e.more.hidden, true);
});

test('the group role carries the label, and slot changes are watched', () => {
    const { el, watched } = make({ max: 2, label: 'Reviewers' }, 1);
    el.connected(); el.updated();
    assert.equal(watched(), 1);
    assert.deepEqual(el.ariaSet, { role: 'group', ariaLabel: 'Reviewers' });
});
