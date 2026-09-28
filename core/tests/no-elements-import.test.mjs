// Regression guard for issue #601: core/js/dock-model.js imported '../elements/splitter/splitter.js'. That resolves fine from source, but
// node scripts/bootstrap.mjs flattens elements to dist/elements/<name>.js, so the built dist/js/dock-model.js requested
// dist/elements/splitter/splitter.js, which 404s (pk-dock silently failed to load whenever a page imported the runtime from dist/).
// No file under core/js/ may import from core/elements/<name>/: shared code elements need lives in core/js/ itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function jsFiles(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...jsFiles(p));
        else if (/\.(js|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
    }
    return out;
}

test('no file under core/js/ imports from core/elements/<name>/', () => {
    const problems = [];
    for (const file of jsFiles(path.join(root, 'js'))) {
        const text = fs.readFileSync(file, 'utf8');
        for (const m of text.matchAll(/from\s+['"]([^'"]*\/elements\/[^'"]*)['"]/g)) {
            problems.push(`${path.relative(root, file).replace(/\\/g, '/')}: imports '${m[1]}'`);
        }
    }
    assert.deepEqual(problems, [], `\n${problems.join('\n')}\n\nnode scripts/bootstrap.mjs flattens elements to dist/elements/<name>.js, so a file under core/js/ that imports '../elements/<name>/<name>.js' resolves in source but 404s once built. Move the shared code into core/js/ instead (issue #601).`);
});
