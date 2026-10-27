// Optional theme stylesheets (themes/<name>.css): built to dist/themes/, listed in the manifest, and never part of the page layer.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../tools/build.mjs';

const { out } = build({ write: false });

test('an optional theme is built into dist/themes and listed in the runtime manifest', () => {
    assert.match(out.get('dist/themes/heading-font.css'), /--font-heading:var\(--font-sans\)/);
    const manifest = JSON.parse(out.get('dist/manifest.json'));
    assert.ok(manifest.files.some(f => f.path === 'themes/heading-font.css'), 'themes/heading-font.css is in dist/manifest.json');
});

test('the page layer does not import or contain an optional theme', () => {
    for (const f of ['dist/plainkit.css', 'dist/plainkit.min.css', 'plainkit.css']) {
        const css = out.get(f);
        if (css === undefined) continue;
        assert.ok(!/themes\//.test(css) && !/--font-heading:var\(--font-sans\)/.test(css), `${f} must not pull in a theme`);
    }
});
