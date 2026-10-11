// Static checks for pk-page-shell (#423): it composes the header, forwards the slots, and replaces the content with a state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const html = read('./page-shell.html'), css = read('./page-shell.css'), js = read('./page-shell.js'), meta = JSON.parse(read('./page-shell.meta.json'));

test('the template is a pk-page-header with the header slots forwarded, a state region and one content region', () => {
    assert.match(html, /<pk-page-header part="header"/);
    for (const s of ['breadcrumb', 'title', 'actions', 'meta', 'tabs']) assert.match(html, new RegExp(`<slot name="${s}" slot="${s}"></slot>`));
    assert.match(html, /<div part="state" role="status" hidden><\/div>/);
    assert.match(html, /<div part="content"><slot><\/slot><\/div>/);
    assert.ok(!/\sstyle=/.test(html));
});

test('the API: a ready state by default, the five states, a retry event', () => {
    const p = Object.fromEntries(meta.props.map(x => [x.name, x]));
    assert.equal(meta.tier, 'component');
    assert.equal(p.state.default, 'ready');
    assert.deepEqual(p.state.values, ['ready', 'loading', 'empty', 'error', 'forbidden']);
    assert.equal(p.level.default, 1);
    assert.ok(meta.events.some(e => e.name === 'pk-page-shell-retry'));
    assert.match(js, /pk-page-shell-retry/);
});

test('one phone media block, tokens only', () => {
    assert.equal((css.match(/@media/g) ?? []).length, 1);
    assert.match(css, /@media \(--phone\)/);
    assert.ok(!/#[0-9a-f]{3,8}\b|\d+px/i.test(css));
});
