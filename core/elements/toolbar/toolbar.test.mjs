// Static checks for pk-toolbar: template, API, and the stacking layout. Run: node --test core
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const html = read('./toolbar.html'), css = read('./toolbar.css'), meta = JSON.parse(read('./toolbar.meta.json'));

test('the template has a lead with title, note and a default slot, and an actions slot', () => {
    assert.match(html, /part="lead"[\s\S]*data-if="heading"[\s\S]*data-if="note"[\s\S]*<slot><\/slot>/);
    assert.match(html, /<slot name="actions">/);
    assert.ok(!/\sstyle=/.test(html));
});

test('the API: heading and note, and the Blazor component', () => {
    assert.deepEqual(meta.props.map(p => p.name), ['heading', 'note']);
    assert.equal(meta.blazor.component, 'PkToolbar');
});

test('it wraps, stacks on a narrow container with touch-sized actions, and uses tokens only', () => {
    assert.match(css, /flex-wrap: wrap/);
    assert.match(css, /@container \(max-width: [\d.]+rem\)[\s\S]*--touch-target/);
    assert.doesNotMatch(css.replace(/var\([^)]*\)/g, ''), /#[0-9a-f]{3,8}\b|rgba?\(/i);
});
