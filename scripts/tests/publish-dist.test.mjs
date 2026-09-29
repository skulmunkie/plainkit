// scripts/publish-dist.mjs: core/dist -> blazor wwwroot/plainkit, and the exclusion lists (#518 A-10a adds tools/, since the audit CLI is a
// Node program shipped through npm's `bin`, not a Blazor static web asset; design 2026-09-28-conformance-audit-cli-design.md, "Blazor package").
// Run: node --test scripts/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { differences, publish } from '../publish-dist.mjs';

function makeTree(dir, files) {
    for (const [rel, content] of files) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content);
    }
}

test('publish() excludes dist/tools/** (the audit CLI) from wwwroot/plainkit', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-publish-dist-'));
    try {
        const from = path.join(dir, 'from'), to = path.join(dir, 'to');
        makeTree(from, [
            ['plainkit.js', 'x'],
            ['tools/audit/cli.mjs', 'x'],
            ['tools/strict/engine.mjs', 'x'],
            ['custom-elements.json', 'x'],
        ]);
        publish(from, to);
        const shipped = fs.readdirSync(to, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.relative(to, path.join(e.parentPath, e.name)).replaceAll('\\', '/'));
        assert.deepEqual(shipped.sort(), ['plainkit.js']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('differences() reports nothing missing or extra once tools/ is excluded on both sides', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-publish-dist-'));
    try {
        const from = path.join(dir, 'from'), to = path.join(dir, 'to');
        makeTree(from, [['plainkit.js', 'x'], ['tools/audit/cli.mjs', 'x']]);
        makeTree(to, [['plainkit.js', 'x']]);
        assert.deepEqual(differences(from, to), []);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('differences() still flags a real gap (a tracked non-tools file missing from the copy)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-publish-dist-'));
    try {
        const from = path.join(dir, 'from'), to = path.join(dir, 'to');
        makeTree(from, [['plainkit.js', 'x'], ['plainkit.css', 'x']]);
        makeTree(to, [['plainkit.js', 'x']]);
        assert.deepEqual(differences(from, to), ['missing: plainkit.css']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
