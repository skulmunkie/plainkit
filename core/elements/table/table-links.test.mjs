// Row links (#366): js/table-links.js, which pk-table loads only when rowHrefTemplate is set. The browser case in core/tests/browser/cases-data-display.js measures the real links.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.HTMLElement ??= class {};
globalThis.CSSStyleSheet ??= class { replaceSync() {} };
const L = await import('../../js/table-links.js');

test('href fills {id} and {field} URL-encoded and accepts only a path or a hash', () => {
    assert.equal(L.href('/orders/{id}', { id: 7 }, '7'), '/orders/7');
    assert.equal(L.href('/orders/{id}?c={c}', { c: 'a b&c' }, 'x/y'), '/orders/x%2Fy?c=a%20b%26c');
    assert.equal(L.href('#/orders/{id}', {}, '3'), '#/orders/3');
    assert.equal(L.href('/o/{missing}', {}, '1'), '/o/', 'an unknown field is empty');
    for (const bad of ['//evil.test/{id}', 'https://evil.test/{id}', `${'java'}script:alert({id})`, '/\\evil', 'orders/{id}', '/a b']) assert.equal(L.href(bad, {}, '1'), null, bad);
    assert.equal(L.href('/x/{id}', {}, '<img onerror=1>'), '/x/%3Cimg%20onerror%3D1%3E', 'no markup survives into the address');
});

const link = href => ({ getAttribute: () => href, click() { this.clicked = true; } });
const target = (a, tr) => ({ closest: s => (s === 'a[data-row-link]' ? a : s === 'tr[data-pk-context]' ? tr : null) });

test('a plain click on a link reports a cancelable pk-navigate and follows the link only when it is not handled', () => {
    const events = [], assigned = [];
    const table = { clickable: false, emit: (n, d) => (events.push([n, d]), false), ownerDocument: { defaultView: { location: { assign: u => assigned.push(u) } } } };
    let prevented = false;
    assert.equal(L.click(table, { target: target(link('/orders/1')), preventDefault: () => (prevented = true) }), true);
    assert.deepEqual(events, [['pk-navigate', { to: '/orders/1', href: '/orders/1' }]]); assert.ok(prevented); assert.deepEqual(assigned, [], 'handled: no page load');
    table.emit = () => true;
    L.click(table, { target: target(link('/orders/2')), preventDefault() {} });
    assert.deepEqual(assigned, ['/orders/2'], 'unhandled: the browser follows the address');
});

test('modified clicks, a hash address and a click elsewhere are left alone; the row body follows its link unless the host owns row clicks', () => {
    const table = { clickable: false, emit: () => assert.fail('no event') };
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) assert.equal(L.click(table, { target: target(link('/o/1')), preventDefault: () => assert.fail('kept'), ...mod }), false);
    assert.equal(L.click(table, { target: target(link('#order-1')), preventDefault: () => assert.fail('kept') }), false);
    assert.equal(L.click(table, { target: target(null, null) }), false);
    const a = link('/o/1'), tr = { querySelector: () => a };
    const body = { closest: s => (s === 'tr[data-pk-context]' ? tr : null) };
    assert.equal(L.click(table, { target: body }), true); assert.ok(a.clicked, 'a click on the row body is a click on its link');
    a.clicked = false;
    assert.equal(L.click({ ...table, clickable: true }, { target: body }), false); assert.ok(!a.clicked, 'a clickable table keeps row clicks for pk-row-click');
});
