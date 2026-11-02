// --color-media-bg (#1845): one theme-invariant declaration in tokens.css, used by the contain-fit media letterbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('--color-media-bg is declared once, in the theme-independent :root block, not under a theme', () => {
    const css = read('../tokens/tokens.css');
    assert.equal((css.match(/--color-media-bg\s*:/g) || []).length, 1);
    const at = css.indexOf('--color-media-bg:');
    const open = css.lastIndexOf('{', at);
    assert.match(css.slice(css.lastIndexOf('}', open) + 1, open), /:root\s*$/);
    assert.match(css.slice(at, css.indexOf(';', at)), /#000/);
});

test('pk-media uses the token for a contain-fit letterbox and declares no colour literal', () => {
    const css = read('../elements/media/media.css');
    assert.match(css, /\[fit="contain"\]\) \[part="box"\]\s*\{[^}]*var\(--color-media-bg\)/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}|black/i);
});
