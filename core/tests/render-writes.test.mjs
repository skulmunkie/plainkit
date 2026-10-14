// Issue #1344: PkElement.render() writes a text or attribute binding only when its value changed. WebKit fires slotchange again for a
// rewritten fallback text inside a watched slot, so an unconditional write made watchSlot -> requestUpdate -> render loop forever.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.HTMLElement ??= class {};
const { PkElement } = await import('../js/element.js');
const { parseBindings } = await import('../js/element-core.js');

// A text node and an element that count every write.
const text = v => ({ writes: 0, _v: v, get nodeValue() { return this._v; }, set nodeValue(x) { this.writes++; this._v = x; } });
const elem = () => ({ writes: 0, a: {}, getAttribute(k) { return k in this.a ? this.a[k] : null; }, setAttribute(k, x) { this.writes++; this.a[k] = x; }, removeAttribute(k) { this.writes++; delete this.a[k]; } });

test('render writes nothing when the bound values are unchanged, and writes once per change', () => {
    const t = text('{{heading}}'), e = elem(), el = Object.create(PkElement.prototype);
    el.$ = { heading: 'Nothing here', level: 2, off: true };
    el.$b = [{ n: t, parts: parseBindings('{{heading}}') }, { n: e, a: 'aria-level', parts: parseBindings('{{level}}') }, { n: e, a: 'title', parts: parseBindings('{{off}}') }];
    el.render();
    assert.equal(t.nodeValue, 'Nothing here'); assert.equal(e.a['aria-level'], '2'); assert.equal(e.a.title, '');
    const [tw, ew] = [t.writes, e.writes];
    for (let i = 0; i < 20; i++) el.render();
    assert.equal(t.writes, tw, 'text node rewritten with the same value'); assert.equal(e.writes, ew, 'attribute rewritten with the same value');
    el.$.heading = 'Other'; el.$.level = 3; el.$.off = false; el.render();
    assert.equal(t.nodeValue, 'Other'); assert.equal(e.a['aria-level'], '3');
    assert.equal('title' in e.a, false, 'a false value removes the attribute');
    assert.equal(t.writes, tw + 1); assert.equal(e.writes, ew + 2);
});
