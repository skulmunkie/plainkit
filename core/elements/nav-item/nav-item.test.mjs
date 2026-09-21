// Contract checks for the nav-item element: template, stylesheet and meta API describe the same thing. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import navItem from './nav-item.js';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./nav-item.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

test('group is a boolean prop and its css shows static muted text, not a row', () => {
    assert.equal(prop('group').type, 'boolean');
    const css = read('css');
    assert.ok(css.includes(':host([group]) [part="link"]') && css.includes('pointer-events: none'));
    assert.ok(css.includes(':host([group]) [part="chevron"] { display: none; }'));
    assert.ok(css.includes(':host([group][rail])'));
});

test('a group title is plain text: no href, tabindex, state attributes or branch toggling', () => {
    const NavItem = navItem(class {});
    const removed = []; const set = {};
    const row = { removeAttribute: a => removed.push(a), setAttribute: (a, v) => { set[a] = v; } };
    const host = { group: true, expanded: false, rail: false, row, emit() { throw new Error('a group title must not emit'); } };
    NavItem.prototype.updated.call(host);
    assert.deepEqual(set, { role: 'presentation' });
    assert.ok(['href', 'tabindex', 'aria-expanded'].every(a => removed.includes(a)));
    NavItem.prototype.branch.call(host);
    assert.equal(host.expanded, false);
});
