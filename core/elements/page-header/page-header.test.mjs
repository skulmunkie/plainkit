// Static checks for pk-page-header: template landmark and slots, the API, and the touch-friendly narrow layout. Run: node --test core
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const html = read('./page-header.html'), css = read('./page-header.css'), meta = JSON.parse(read('./page-header.meta.json'));

test('the template is a header element with a heading-role title and the four slots, and no inline style', () => {
    assert.match(html, /<header[^>]*part="header"/);
    assert.match(html, /role="heading" aria-level="\{\{level\}\}"/);
    for (const s of ['breadcrumb', 'actions', 'meta']) assert.match(html, new RegExp(`<slot name="${s}">`));
    assert.match(html, /<slot><\/slot>/);
    assert.ok(!/\sstyle=/.test(html));
});

test('the API: heading, level, variant page|section|record, and the Blazor component', () => {
    const p = Object.fromEntries(meta.props.map(x => [x.name, x]));
    assert.equal(p.level.default, 2);
    assert.deepEqual(p.variant.values, ['page', 'section', 'record']);
    assert.equal(p.variant.default, 'page');
    assert.equal(meta.blazor.component, 'PkPageHeader');
    assert.ok(meta.examples.some(e => /variant="record"/.test(e.html)) && meta.examples.some(e => /variant="section"/.test(e.html)));
});

test('it stacks by its own width and keeps actions touch-sized, with tokens only', () => {
    assert.match(css, /container-type: inline-size/);
    assert.match(css, /@container \(max-width: [\d.]+rem\)[\s\S]*--touch-target/);
    assert.doesNotMatch(css.replace(/var\([^)]*\)/g, ''), /#[0-9a-f]{3,8}\b|rgba?\(/i);
});
