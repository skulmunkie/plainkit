// scripts/publish-dist.mjs: core/dist -> blazor wwwroot/plainkit, and the exclusion lists (#518 A-10a adds tools/, since the audit CLI is a
// Node program shipped through npm's `bin`, not a Blazor static web asset; design 2026-09-28-conformance-audit-cli-design.md, "Blazor package").
// Run: node --test scripts/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { differences, publish, KEEP_FROM_TOOLS } from '../publish-dist.mjs';

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

test('publish() keeps the one tools file the browser code imports, and every static import of the shipped JavaScript resolves inside the package', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-publish-dist-'));
    try {
        const from = path.join(dir, 'from'), to = path.join(dir, 'to');
        makeTree(from, [['plainkit.js', 'x'], ['tools/audit/cli.mjs', 'x'], ['tools/audit/scanners/literals.mjs', 'x']]);
        publish(from, to);
        assert.ok(fs.existsSync(path.join(to, 'tools/audit/scanners/literals.mjs')) && !fs.existsSync(path.join(to, 'tools/audit/cli.mjs')));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    // The real package copy: a relative static import that leaves the shipped files is a 404 at runtime (the dev tools page failed this way).
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot', 'plainkit');
    const missing = [];
    for (const e of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!e.isFile() || !/\.(m?js)$/.test(e.name) || e.parentPath.includes('skills')) continue;
        const file = path.join(e.parentPath, e.name);
        // minified or not: import { a } from "./x.js", export * from '../y.js', import "./z.js"
        for (const m of fs.readFileSync(file, 'utf8').matchAll(/\b(?:import|export)\s*(?:\{[^}]*\}|\*\s*(?:as\s+[\w$]+)?|[\w$]+)?\s*from\s*["'](\.{1,2}\/[^"']+)["']|\bimport\s*["'](\.{1,2}\/[^"']+)["']/g)) {
            const target = path.resolve(path.dirname(file), m[1] ?? m[2]);
            if (!fs.existsSync(target)) missing.push(`${path.relative(root, file)} imports ${m[1] ?? m[2]}`);
        }
    }
    assert.deepEqual(missing, [], 'FIX: ship the file (scripts/publish-dist.mjs KEEP_FROM_TOOLS) or stop importing it from browser code');
    assert.ok(KEEP_FROM_TOOLS.has('tools/audit/scanners/literals.mjs'));
});
