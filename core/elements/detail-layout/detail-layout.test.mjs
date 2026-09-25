// Contract checks for the detail-layout element: template, stylesheet and meta API describe the same thing (issue 220).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./detail-layout.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

test('sidebarFirst and sidebarTwoUp are plain reflected booleans', () => {
    for (const name of ['sidebarFirst', 'sidebarTwoUp']) {
        assert.equal(prop(name).type, 'boolean');
        assert.equal(prop(name).default, false);
        assert.equal(prop(name).reflect, true);
    }
});

test('the default slot is the main content, sidebar is the only named slot', () => {
    assert.deepEqual(meta.slots.map(s => s.name).sort(), ['', 'sidebar']);
});

test('the sidebar width is a CSS custom property, not a prop (a length cannot be a useful container-query-safe attribute)', () => {
    assert.ok(meta.cssProperties.some(p => p.name === '--pk-detail-layout-sidebar' && p.default === '20rem'));
    assert.ok(!meta.props.some(p => p.name.toLowerCase().includes('width')));
});

test('the collapse breakpoint is a container query, not a media query, so it is independent of the viewport', () => {
    const css = read('css');
    assert.match(css, /container-type: inline-size/);
    assert.match(css, /@container \(max-width: 48rem\)/);
    assert.doesNotMatch(css, /@media/, 'a media query would depend on the viewport, not the container the issue asks for');
});

test('sidebarFirst reorders the sidebar and sidebarTwoUp changes its grid only inside the collapsed block, never in the two-column layout', () => {
    const css = read('css');
    const collapsed = css.slice(css.indexOf('@container'));
    assert.match(collapsed, /:host\(\[sidebar-first\]\) \[part="sidebar"\] \{ order: -1; \}/);
    assert.match(collapsed, /:host\(\[sidebar-two-up\]\) \[part="sidebar"\] \{ grid-template-columns: 1fr 1fr; \}/);
    const beforeCollapse = css.slice(0, css.indexOf('@container'));
    assert.doesNotMatch(beforeCollapse, /sidebar-first|sidebar-two-up/);
});

test('the sidebar sticks by its bottom edge when taller than the viewport, and docks flush right (issue 281)', () => {
    const css = read('css');
    assert.match(css, /top: min\(var\(--space-4\), calc\(100dvh - var\(--pk-detail-layout-height, 0px\) - var\(--space-4\)\)\)/);
    assert.match(css, /justify-self: end/);
    assert.ok(meta.cssProperties.some(p => p.name === '--pk-detail-layout-main-max'));
    assert.match(fs.readFileSync(fileURLToPath(new URL('./detail-layout.js', import.meta.url)), 'utf8'), /disconnect\(\)/);
});
