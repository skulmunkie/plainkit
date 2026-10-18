// Contract checks for the app-frame element: template, stylesheet, script and meta API describe the same thing. Behaviour is the browser cases and the
// review scenario app-frame. Run: node --test core/shells/app-frame
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./app-frame.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

test('the model comes in as JSON props and the host owns routing: no navigation event, only search and theme', () => {
    for (const n of ['nav', 'trail', 'modules', 'crumbs', 'searchItems']) { assert.equal(prop(n).type, 'json'); assert.deepEqual(prop(n).default, []); }
    assert.deepEqual(meta.events.map(e => e.name).sort(), ['pk-query', 'pk-select', 'pk-theme-toggle']);
    assert.equal(meta.tier, 'shell');
});

test('the frame composes the shell, the navbar, the side nav and the breadcrumb in its own shadow tree, and writes nothing outside it', () => {
    const html = read('html');
    for (const tag of ['pk-app-shell', 'pk-navbar', 'pk-side-nav', 'pk-breadcrumb', 'pk-app-bar-search']) assert.match(html, new RegExp(`<${tag}[ >]`));
    assert.match(html, /<pk-button slot="header"[^>]*data-nav-toggle/, 'the one menu control');
    assert.deepEqual(meta.writes, []);
});

test('links go through safeHref and the script has no inline handler or style attribute', () => {
    const js = read('js');
    assert.match(js, /safeHref\(this\.brandHref\)/);
    assert.match(js, /safeHref\(it\.href\)/);
    assert.doesNotMatch(js, /innerHTML|setAttribute\('style'|\.style\./);
});

test('busy blocks only the page slot behind a pk-loading-overlay with the page delay and minimum time (#1545)', () => {
    const html = read('html');
    assert.match(html, /<pk-loading-overlay delay="150" min-time="300"><slot><\/slot><\/pk-loading-overlay>/);
    assert.equal(prop('busy').type, 'boolean'); assert.equal(prop('busy').default, false);
    assert.equal(prop('busyLabel').type, 'string');
    assert.match(read('js'), /querySelector\('pk-loading-overlay'\)[\s\S]*busy: this\.busy, label: this\.busyLabel/);
});
