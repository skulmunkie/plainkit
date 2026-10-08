// Static checks for pk-card-menu (issue 728): the template composes pk-dropdown and an icon pk-button, the API is small, tokens only. Run: node --test core
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const html = read('./card-menu.html'), css = read('./card-menu.css'), js = read('./card-menu.js'), meta = JSON.parse(read('./card-menu.meta.json'));

test('the template is a pk-dropdown opened by an icon-only ghost pk-button, items forwarded through the default slot', () => {
    assert.match(html, /<pk-dropdown part="menu"[^>]*placement="\{\{placement\}\}"/);
    assert.match(html, /<pk-button part="button" slot="trigger"[^>]*variant="ghost"[^>]*size="mini"[^>]*icon[^>]*icon-name="\{\{iconName\}\}"[^>]*label="\{\{label\}\}"/);
    assert.match(html, /<slot><\/slot><\/pk-dropdown>/);
    assert.ok(!/\sstyle=/.test(html));
});

test('the API: label, icon, placement and open, with the dropdown commit events', () => {
    assert.equal(meta.tier, 'component');
    assert.deepEqual(meta.props.map(p => p.name), ['label', 'iconName', 'placement', 'open']);
    assert.equal(meta.props.find(p => p.name === 'label').default, 'Card actions');
    assert.equal(meta.props.find(p => p.name === 'iconName').default, 'more');
    assert.equal(meta.props.find(p => p.name === 'placement').default, 'bottom-end');
    assert.deepEqual(meta.props.find(p => p.name === 'open').commit, ['pk-open', 'pk-close']);
    assert.ok(meta.events.some(e => e.name === 'pk-select'));
});

test('it does not re-implement the menu: no key handling, no positioning, no focus code', () => {
    assert.doesNotMatch(js, /keydown|positioning|focusTrigger|\.focus\(/);
    assert.match(js, /loadElements/);
});

test('the host stays a single inline button, and uses tokens only', () => {
    assert.match(css, /:host/);
    assert.doesNotMatch(css.replace(/var\([^)]*\)/g, ''), /#[0-9a-f]{3,8}\b|rgba?\(/i);
});
