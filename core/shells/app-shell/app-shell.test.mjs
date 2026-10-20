// Contract checks for the app-shell element: template, stylesheet and meta API describe the same thing. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./app-shell.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

// Issue #21: the body padding could not be removed, so a workspace could not sit edge to edge.
test('flush is a boolean prop that removes the body padding but keeps the safe-area insets', () => {
    assert.equal(prop('flush').type, 'boolean'); assert.equal(prop('flush').default, false); assert.equal(prop('flush').reflect, true);
    const rule = read('css').match(/:host\(\[flush\]\) \[part="body"\] \{([^}]*)\}/);
    assert.ok(rule, 'a flush body rule');
    assert.match(rule[1], /padding: 0;/);
    assert.match(rule[1], /env\(safe-area-inset-left\)/);
});

// Issue #54: a back link in the top bar. Issue #648: the header has no title concept of its own any more;
// the page's title belongs only to the page's own pk-page-header, in the body.
test('the top bar has a back link driven by back-href and back-label, and no title slot or part', () => {
    const html = read('html');
    assert.doesNotMatch(html, /<slot name="title">/);
    assert.match(html, /<a part="back" data-if="backHref" aria-label="\{\{backLabel\}\}">/);
    assert.match(html, /aria-hidden="true">&larr;</, 'the arrow is decoration; the name comes from back-label');
    assert.equal(prop('backHref').type, 'string'); assert.equal(prop('backHref').default, '');
    assert.equal(prop('backLabel').default, 'Back');
    assert.ok(!meta.slots.some(s => s.name === 'title') && !meta.parts.some(p => p.name === 'title') && meta.parts.some(p => p.name === 'back'));
    assert.match(read('css'), /\[part="back"\] \{[^}]*min-width: var\(--touch-target\); min-height: var\(--touch-target\)/, '44px target');
    assert.match(meta.a11y, /back link/);
});

// Issue #1551: a page type that pins its header row and pager needs a flex column of definite height to fill, so the body is one.
test('the body is a flex column, so a filling page type pins its header and pager while only its rows scroll', () => {
    const rule = read('css').match(/\[part="body"\] \{([^}]*)\}/);
    assert.ok(rule, 'a body rule');
    assert.match(rule[1], /\bflex: 1\b/);
    assert.match(rule[1], /min-height: 0/);
    assert.match(rule[1], /display: flex/);
    assert.match(rule[1], /flex-direction: column/);
    assert.match(rule[1], /overflow-y: auto/);
});

// Issue #1675: `contain` makes the body a named size container and lets any one child fill it, with no wrapper element; off by default.
test('contain is an opt-in boolean: a named inline-size container, clipped sideways, the slotted child fills', () => {
    assert.equal(prop('contain').type, 'boolean'); assert.equal(prop('contain').default, false); assert.equal(prop('contain').reflect, true);
    assert.ok(meta.cssProperties.some(p => p.name === '--pk-app-shell-container' && p.default === 'page'));
    const css = read('css');
    assert.match(css, /:host\(\[contain\]\) \[part="body"\] \{[^}]*container: var\(--pk-app-shell-container, page\) \/ inline-size;[^}]*overflow-x: clip;/);
    assert.match(css, /:host\(\[contain\]\) \[part="body"\] > slot:not\(\[name\]\)::slotted\(\*\) \{[^}]*flex: 1 1 auto;[^}]*min-block-size: 0;/);
    assert.doesNotMatch(css.replace(/:host\(\[contain\]\)[^{]*\{[^}]*\}/g, ''), /container(-type|-name)?:/, 'only the contain rule makes a container');
});

// The Blazor wrapper carries it as a generated extra parameter (#1407), so a hand-written file does not grow.
test('the Blazor mapping has Contain as an extra bool parameter', () => {
    const m = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../blazor/mappings/app-shell.json', import.meta.url)), 'utf8'));
    const p = m.params.find(x => x.name === 'Contain');
    assert.ok(p && p.prop === 'contain' && p.type === 'bool' && p.extra === true);
});
