// #1814: the surface-effect (glass) tokens are off by default, and every element that reads them falls back to its own solid surface
// under reduced transparency, more contrast, or without backdrop-filter support. The solid surfaces keep text at AA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listElementFolders } from '../tools/element-folders.mjs';
import { parseTokenBlocks } from '../js/theme.js';
import { contrastFailures } from '../js/audit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokens = fs.readFileSync(path.join(root, 'tokens', 'tokens.css'), 'utf8');

test('the surface tokens exist and are off by default: no blur, no tint, no highlight (#1814)', () => {
    const shared = parseTokenBlocks(tokens).root;
    assert.equal(shared['--surface-blur'], 'initial');
    assert.equal(shared['--surface-saturate'], '100%');
    assert.equal(shared['--surface-tint'], 'initial');
    assert.equal(shared['--surface-border-highlight'], 'transparent');
});

test('the solid surfaces a glass element falls back to keep text at AA in both themes (#1814)', () => {
    assert.deepEqual(contrastFailures(tokens, [['--color-text', '--color-panel'], ['--color-text', '--color-flyout'], ['--color-muted', '--color-panel'], ['--color-muted', '--color-flyout'], ['--color-muted-strong', '--color-flyout']]), []);
});

test('every element that reads --surface-tint blurs through the tokens and falls back to its solid surface (#1814)', () => {
    for (const { name, dir } of listElementFolders(root)) {
        const f = path.join(dir, `${name}.css`);
        if (!fs.existsSync(f)) continue;
        const css = fs.readFileSync(f, 'utf8');
        if (!css.includes('var(--surface-tint')) continue;
        const solid = /var\(--surface-tint, var\((--color-(?:panel|flyout))\)\)/.exec(css)?.[1];
        assert.ok(solid, `${name}.css: FIX: write the background as var(--surface-tint, var(--color-panel)) (or --color-flyout), so the default look is the solid surface`);
        assert.match(css, /backdrop-filter: blur\(var\(--surface-blur\)\) saturate\(var\(--surface-saturate\)\)/, `${name}.css: FIX: blur with backdrop-filter: blur(var(--surface-blur)) saturate(var(--surface-saturate))`);
        for (const at of ['@media (prefers-reduced-transparency: reduce)', '@media (prefers-contrast: more)', '@supports not (backdrop-filter: blur(1px))']) {
            const i = css.indexOf(at);
            assert.ok(i >= 0, `${name}.css: FIX: add a one-line ${at} { ... background: var(${solid}); } rule`);
            const line = css.slice(i, css.indexOf('\n', i));
            assert.ok(line.includes(`background: var(${solid})`), `${name}.css: FIX: ${at} must set background: var(${solid}) on the same line`);
            if (at.startsWith('@media')) assert.match(line, /backdrop-filter: none/, `${name}.css: FIX: ${at} must also set backdrop-filter: none on the same line`);
        }
    }
});
