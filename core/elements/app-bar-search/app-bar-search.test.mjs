// Contract checks for the app-bar-search element: template, stylesheet and meta API describe the same thing. Behaviour (debounce, keyboard
// nav, the shell/navigation coordination) is covered by the browser cases (issue 213). Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./app-bar-search.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

test('items is a JSON prop (like pk-table rows/columns), not a JS-only property: it works as a plain attribute too', () => {
    assert.equal(prop('items').type, 'json');
    assert.deepEqual(prop('items').default, []);
    assert.equal(prop('items').reflect, false);
});

test('expanded is a two-way boolean with a commit event, so the host can set it (Blazor closes it on navigation) without the element re-announcing a change it did not make', () => {
    assert.equal(prop('expanded').type, 'boolean');
    assert.equal(prop('expanded').default, false);
    assert.equal(prop('expanded').reflect, true);
    assert.equal(prop('expanded').commit, 'pk-toggle');
});

test('debounce defaults to 250ms, the same debounce pk-table\'s filter row already uses', () => {
    assert.equal(prop('debounce').type, 'number');
    assert.equal(prop('debounce').default, 250);
});

test('the template has the expand button, the field with its own popup nested inside it (so position: relative on the field contains the absolutely positioned popup), and a result-row template', () => {
    const html = read('html');
    assert.match(html, /<button part="expand"/);
    assert.match(html, /<div part="box"[^>]*>[\s\S]*<div part="popup"[\s\S]*<\/div><\/div>/);
    assert.match(html, /<template><div part="option"/);
    for (const part of ['row-label', 'row-sub', 'thumb', 'badge']) assert.ok(meta.parts.some(p => p.name === part), `${part} is documented`);
});

test('the events pk-query, pk-select and pk-toggle are documented with the shapes the generated Blazor EventArgs already carry', () => {
    const names = meta.events.map(e => e.name);
    assert.deepEqual(names.sort(), ['pk-query', 'pk-select', 'pk-toggle']);
    assert.deepEqual(meta.events.find(e => e.name === 'pk-query').detail, { query: 'string' });
    assert.deepEqual(meta.events.find(e => e.name === 'pk-select').detail, { item: 'object' });
    assert.deepEqual(meta.events.find(e => e.name === 'pk-toggle').detail, { expanded: 'bool' });
});

test('the phone breakpoint is named, not a literal, and collapses the pill to the expand button', () => {
    const css = read('css');
    assert.match(css, /@media \(--phone\)/);
    assert.doesNotMatch(css, /@media \(max-width: \d+px\)/, 'a literal breakpoint would fail core/tests/breakpoints.test.mjs too');
    assert.match(css, /@media \(--phone\) \{[\s\S]*\.exp \{ display: inline-flex/);
});
