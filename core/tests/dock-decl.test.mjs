import { test } from 'node:test';
import assert from 'node:assert/strict';
import { center, canClose, canFloat, canCollapse, init, seed } from '../js/dock-render.js';
import { floaters, groups } from '../js/dock-model.js';

const child = attrs => ({ getAttribute: n => attrs[n] ?? null, hasAttribute: n => n in attrs });
const host = (...kids) => ({ children: kids, $closed: new Set() });
const el = host(
    child({ slot: 'palette', 'data-group': 'left', 'data-open': 'false' }),
    child({ slot: 'canvas', 'data-group': 'center' }),
    child({ slot: 'props', 'data-group': 'right', 'data-closable': 'false', 'data-collapsible': 'false' }),
    child({ slot: 'notes', 'data-group': 'right', 'data-float': '' }),
);
const all = ['palette', 'canvas', 'props', 'notes'].map(id => ({ id, title: id, group: 'x' }));

test('the centre is the first panel with an explicit data-group=center, and is never closable or floatable', () => {
    assert.equal(center(el), 'canvas');
    assert.equal(canClose(el, 'canvas'), false);
    assert.equal(canFloat(el, 'canvas'), false);
    assert.equal(center(host(child({ slot: 'a' }))), undefined);
});

test('closable and collapsible honour data-closable and data-collapsible only when "false"', () => {
    assert.equal(canClose(el, 'props'), false);
    assert.equal(canClose(el, 'notes'), true);
    assert.equal(canCollapse(el, 'props'), false);
    assert.equal(canCollapse(el, 'palette'), true);
});

test('init closes data-open=false panels and starts the phone strip on the centre', () => {
    init(el, all);
    assert.deepEqual([...el.$closed], ['palette']);
    assert.equal(el.$phone, 'canvas');
});

test('seed floats data-float panels (not the centre) out of the default arrangement', () => {
    const doc = seed(el, all.filter(p => p.id !== 'palette').map(p => ({ ...p, group: p.id === 'canvas' ? 'center' : 'right' })));
    assert.deepEqual(floaters(doc).map(f => f.group.panels), [['notes']]);
    assert.ok(groups(doc).some(g => g.panels.includes('canvas')));
});
