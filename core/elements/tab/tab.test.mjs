import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import tab from './tab.js';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./tab.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

// Issue #21: the close button of a tab was tabindex=-1 and so unreachable by keyboard.
test('the close button is not taken out of the tab order by its template', () => {
    assert.ok(!/tabindex/i.test(read('html')));
    assert.ok(prop('closable'));
});

test('the close button of the selected tab is a tab stop; the others stay out (roving, like the tabs)', () => {
    const Tab = tab(class {});
    const button = { tabIndex: -2 };
    const host = { selected: true, disabled: false, part: name => (name === 'close' ? button : null), aria() {} };
    Tab.prototype.updated.call(host);
    assert.equal(button.tabIndex, 0);
    host.selected = false; Tab.prototype.updated.call(host);
    assert.equal(button.tabIndex, -1);
});

test('the a11y note says how a keyboard user closes a tab', () => {
    assert.match(meta.a11y, /Enter or Space closes/);
});
