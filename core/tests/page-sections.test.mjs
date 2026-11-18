// bindSections (js/page-sections.js, #2010): the page's tab strip and its pk-detail-layout stay in step both ways. Stub elements, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindSections } from '../js/page-sections.js';

const target = extra => Object.assign(new EventTarget(), extra);
const fire = (el, type, detail) => el.dispatchEvent(Object.assign(new Event(type), { detail }));
const make = () => {
    const strip = target({ value: 'a' });
    const layout = target({ section: 'a', cancel: false, picks: [], pick(name) { this.picks.push(name); const previous = this.section; this.section = name; fire(this, 'pk-section-change', { section: name, previous }); if (this.cancel) this.section = previous; } });
    return { strip, layout, off: bindSections(strip, layout) };
};
const tick = () => new Promise(r => queueMicrotask(r));

test('a chosen tab picks that section in the layout', () => {
    const { strip, layout } = make();
    fire(strip, 'pk-tab-change', { value: 'b' });
    assert.deepEqual(layout.picks, ['b']);
    assert.equal(layout.section, 'b');
});
test('a section change the layout makes itself (Next, a revealed invalid control) moves the strip', async () => {
    const { strip, layout } = make();
    layout.section = 'c'; fire(layout, 'pk-section-change', { section: 'c', previous: 'a' });
    await tick();
    assert.equal(strip.value, 'c');
});
test('a cancelled change puts the strip back on the old section', async () => {
    const { strip, layout } = make();
    layout.cancel = true;
    strip.value = 'b'; fire(strip, 'pk-tab-change', { value: 'b' });
    await tick(); await tick();
    assert.equal(layout.section, 'a');
    assert.equal(strip.value, 'a');
});
test('the returned function unbinds both listeners', () => {
    const { strip, layout, off } = make();
    off();
    fire(strip, 'pk-tab-change', { value: 'b' });
    assert.deepEqual(layout.picks, []);
});
