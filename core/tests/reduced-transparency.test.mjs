// #1814: an element that blurs what is behind it (backdrop-filter) drops the blur for a reader who asked for reduced transparency.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listElementFolders } from '../tools/element-folders.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every element stylesheet with a backdrop-filter also turns it off under prefers-reduced-transparency: reduce (#1814)', () => {
    const blurring = [];
    for (const { name, dir } of listElementFolders(root)) {
        const f = path.join(dir, `${name}.css`);
        if (!fs.existsSync(f)) continue;
        const css = fs.readFileSync(f, 'utf8');
        if (!/backdrop-filter:\s*(?!none)/.test(css)) continue;
        blurring.push(name);
        assert.match(css, /@media \(prefers-reduced-transparency: reduce\)\s*\{[^@]*backdrop-filter:\s*none/, `${name}.css blurs (backdrop-filter) but never turns it off. FIX: add @media (prefers-reduced-transparency: reduce) { <selector> { backdrop-filter: none; } }`);
    }
    assert.ok(blurring.includes('dialog') && blurring.includes('lightbox'), `the scan found the known blurs (found: ${blurring.join(', ')})`);
});
