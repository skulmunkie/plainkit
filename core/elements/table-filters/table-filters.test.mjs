// Contract checks for the table-filters element: template, stylesheet and meta API describe the same thing. Behaviour (debounce, the
// trigger/panel toggling, keyboard) is covered by the browser cases (issue 203). Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./table-filters.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

test('open is a two-way boolean with a commit event, the same shape pk-app-bar-search\'s expanded already uses', () => {
    assert.equal(prop('open').type, 'boolean');
    assert.equal(prop('open').default, false);
    assert.equal(prop('open').reflect, true);
    assert.equal(prop('open').commit, 'pk-toggle');
});

test('filterCount is a plain number the host sets; label is a plain string', () => {
    assert.equal(prop('filterCount').type, 'number');
    assert.equal(prop('filterCount').default, 0);
    assert.equal(prop('label').type, 'string');
    assert.equal(prop('label').default, 'Search');
});

test('the default slot is documented as the filter fields, and is the only slot', () => {
    assert.deepEqual(meta.slots.map(s => s.name), ['']);
});

test('the events pk-search, pk-toggle and pk-clear-filters are documented with the shapes the generated Blazor EventArgs already carry', () => {
    const names = meta.events.map(e => e.name);
    assert.deepEqual(names.sort(), ['pk-clear-filters', 'pk-search', 'pk-toggle']);
    assert.deepEqual(meta.events.find(e => e.name === 'pk-search').detail, { query: 'string' });
    assert.deepEqual(meta.events.find(e => e.name === 'pk-toggle').detail, { open: 'bool' });
    assert.equal(meta.events.find(e => e.name === 'pk-clear-filters').detail, null);
});

test('the template has the search box, the trigger with its badge, and the panel with header/body/footer, each part documented', () => {
    const html = read('html');
    assert.match(html, /<input part="search"/);
    assert.match(html, /<button part="trigger"[^>]*>[\s\S]*<span part="count"/);
    assert.match(html, /<div part="panel"[\s\S]*<div part="header">[\s\S]*<div part="body">[\s\S]*<div part="footer">/);
    for (const part of ['search', 'trigger', 'count', 'panel', 'header', 'heading', 'close', 'body', 'footer', 'clear']) {
        assert.ok(meta.parts.some(p => p.name === part), `${part} is documented`);
    }
});

test(':host is display: contents, so the controls flow into whatever row the host places the element in (pk-table\'s toolbar)', () => {
    assert.match(read('css'), /:host \{ position: relative; display: contents; \}/);
});

test('the phone breakpoint is named, not a literal', () => {
    const css = read('css');
    assert.match(css, /@media \(--phone\)/);
    assert.doesNotMatch(css, /@media \(max-width: \d+px\)/, 'a literal breakpoint would fail core/tests/breakpoints.test.mjs too');
});
