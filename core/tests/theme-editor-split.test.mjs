// The theme editor's first load (#107, step 3): the Custom SDK tab and the dialogs load on demand, so the editor module does not import them (or what they pull in) statically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../modules/theme-editor/', import.meta.url);
const source = fs.readFileSync(fileURLToPath(new URL('theme-editor.js', dir)), 'utf8');
const staticImports = [...source.matchAll(/^import\s[^;]*?from\s*'([^']+)'/gm)].map(m => m[1]);

test('theme-editor.js imports no heavy tab code statically', () => {
    for (const heavy of [`./sdk-tab.js`, `../../js/dialogs.js`, `../../js/custom-sdk.js`, `../../js/custom-sdk-files.js`, `../../js/custom-sdk-logic.js`, `../../js/custom-sdk-breakpoints.js`, `../../js/zip-store.js`]) {
        assert.ok(!staticImports.includes(heavy), `${heavy} must load on demand`);
    }
});

test('the Custom SDK tab and the dialogs are dynamic imports', () => {
    assert.match(source, /import\('\.\/sdk-tab\.js'\)/);
    assert.match(source, /import\('\.\.\/\.\.\/js\/dialogs\.js'\)/);
});

test('sdk-tab.js is still part of the shipped module folder', async () => {
    const { MODULES } = await import('../tools/modules-dist.mjs');
    assert.ok(MODULES['theme-editor'].files.includes('sdk-tab.js'));
});
