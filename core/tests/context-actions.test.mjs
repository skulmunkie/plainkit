// Unit tests for js/context-actions.js: the shared { action, label, shortcut?, disabled?, danger? } contract behind an element's context
// menu (issue #586), on a minimal fake DOM (the same pattern as element-inspector.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeDom() {
    class El {
        constructor(tag) { this.localName = tag; this.attrs = new Map(); this.children = []; this.text = ''; this.listeners = {}; }
        setAttribute(k, v) { this.attrs.set(k, String(v)); }
        getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
        removeAttribute(k) { this.attrs.delete(k); }
        get disabled() { return this.attrs.has('disabled'); }
        get dataset() { const attrs = this.attrs; return new Proxy({}, { get: (_, k) => attrs.get('data-' + String(k).replace(/[A-Z]/g, m => '-' + m.toLowerCase())) }); }
        append(...kids) { for (const k of kids) { const n = typeof k === 'string' ? Object.assign(new El('#text'), { text: k }) : k; n.parent = this; this.children.push(n); } }
        set textContent(v) { this.text = v; this.children = []; }
        get textContent() { return this.text || this.children.map(c => c.textContent).join(''); }
        remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
        querySelectorAll(sel) {
            // Only the one selector this module uses: ':scope > [slot="menu"]'
            if (sel !== ':scope > [slot="menu"]') throw new Error('unexpected selector ' + sel);
            return this.children.filter(c => c.getAttribute('slot') === 'menu');
        }
        closest(sel) {
            if (sel !== 'pk-menu-item[data-action]') throw new Error('unexpected selector ' + sel);
            let n = this;
            while (n) { if (n.localName === 'pk-menu-item' && n.attrs.has('data-action')) return n; n = n.parent; }
            return null;
        }
        addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
        removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn); }
        fire(type, detail, target = this) { for (const f of [...(this.listeners[type] ?? [])]) f({ type, detail, target }); }
    }
    const doc = { createElement: t => new El(t) };
    return { El, doc };
}

test('paints the item list into pk-menu-item rows on pk-open, replacing any previous ones', async () => {
    const { El, doc } = fakeDom();
    const { wireContextMenu } = await import('../js/context-actions.js');
    const menu = new El('pk-context-menu');
    menu.ownerDocument = doc;
    const stale = new El('pk-menu-item'); stale.setAttribute('slot', 'menu');
    menu.append(stale);

    let seenTarget;
    wireContextMenu(menu, {
        items: target => { seenTarget = target; return [{ action: 'open', label: 'Open' }, { action: 'remove', label: 'Delete', danger: true, shortcut: 'Del' }, { action: 'noop', label: 'Later', disabled: true }]; },
        run: () => {},
    });

    menu.fire('pk-open', { x: 1, y: 2, target: null, context: 'row-7' });
    assert.equal(seenTarget, 'row-7');
    assert.equal(stale.removed, true, 'the stale row from before this open is removed');
    const rows = menu.children.filter(c => c.getAttribute('slot') === 'menu');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].getAttribute('value'), 'open');
    assert.equal(rows[0].textContent, 'Open');
    assert.equal(rows[1].getAttribute('danger'), '');
    assert.equal(rows[1].children[0].getAttribute('slot'), 'suffix');
    assert.equal(rows[1].children[0].textContent, 'Del');
    assert.equal(rows[2].getAttribute('disabled'), '');
});

test('defaults to resolving the target from pk-open\'s context field (a pk-table row id)', async () => {
    const { El, doc } = fakeDom();
    const { wireContextMenu } = await import('../js/context-actions.js');
    const menu = new El('pk-context-menu');
    menu.ownerDocument = doc;
    let seen;
    wireContextMenu(menu, { items: () => [], run: () => {} });
    wireContextMenu(menu, { items: t => { seen = t; return []; }, run: () => {} });
    menu.fire('pk-open', { context: 'row-3' });
    assert.equal(seen, 'row-3');
});

test('pk-select dispatches run(action, target) for an enabled row, and never for a disabled one', async () => {
    const { El, doc } = fakeDom();
    const { wireContextMenu } = await import('../js/context-actions.js');
    const menu = new El('pk-context-menu');
    menu.ownerDocument = doc;
    const calls = [];
    wireContextMenu(menu, {
        items: () => [{ action: 'open', label: 'Open' }, { action: 'remove', label: 'Delete', disabled: true }],
        run: (action, target) => calls.push([action, target]),
    });
    menu.fire('pk-open', { context: 'row-1' });
    const [openRow, removeRow] = menu.children.filter(c => c.getAttribute('slot') === 'menu');
    menu.fire('pk-select', {}, openRow);
    menu.fire('pk-select', {}, removeRow);
    assert.deepEqual(calls, [['open', 'row-1']]);
});

test('the teardown function returned by wireContextMenu removes both listeners', async () => {
    const { El, doc } = fakeDom();
    const { wireContextMenu } = await import('../js/context-actions.js');
    const menu = new El('pk-context-menu');
    menu.ownerDocument = doc;
    let opens = 0;
    const stop = wireContextMenu(menu, { items: () => { opens++; return []; }, run: () => {} });
    menu.fire('pk-open', {});
    stop();
    menu.fire('pk-open', {});
    menu.fire('pk-select', {}, new El('pk-menu-item'));
    assert.equal(opens, 1, 'no further paint after teardown');
});
