// Page-weight ratchet: for each reference page (scripts/bench/ref-pages.mjs) the gzip and brotli bytes and the request count of its static request graph,
// read from the built core/dist, must not exceed page-weight.ceiling.json. Bytes and counts only, no browser, no timings: the same answer every run.
// A change that adds a shared import to element.js shows on every page row at once, which the per-file budgets cannot see.
// THE CEILING ONLY EVER SHRINKS: lower a number when a page gets lighter; never raise one and never add an entry to hide growth. Make the source smaller.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REF_PAGES } from '../../scripts/bench/ref-pages.mjs';
import { pageGraph } from '../../scripts/bench/wire-graph.mjs';

const ceiling = JSON.parse(fs.readFileSync(new URL('./page-weight.ceiling.json', import.meta.url), 'utf8'));
if (!fs.existsSync(new URL('../dist/plainkit.min.css', import.meta.url))) throw new Error('core/dist is missing: run `node scripts/bootstrap.mjs` first');

test('every reference page has a ceiling and no ceiling is orphaned', () => {
    assert.deepEqual(Object.keys(ceiling).filter(k => k[0] !== '_').sort(), Object.keys(REF_PAGES).sort());
});

for (const [name, page] of Object.entries(REF_PAGES)) {
    test(`page weight: ${name} stays under its ceiling`, () => {
        const g = pageGraph(page.html, page.path), c = ceiling[name];
        for (const k of ['requests', 'gzip', 'brotli']) {
            assert.ok(g[k] <= c[k], `${name} ${k} is ${g[k]}, ceiling ${c[k]}. FIX: make the page lighter (a new shared import? run \`node scripts/bench/wire.mjs\` to see the files); never raise page-weight.ceiling.json.`);
        }
        // A ceiling with slack hides growth: it must stay within 2 percent of the measured value (and equal for the request count).
        for (const k of ['gzip', 'brotli']) assert.ok(c[k] <= g[k] * 1.02, `${name} ${k} ceiling ${c[k]} is more than 2 percent above the measured ${g[k]}. FIX: lower it to ${Math.ceil(g[k] / 100) * 100}.`);
        assert.ok(c.requests <= g.requests, `${name} requests dropped to ${g.requests}, ceiling ${c.requests}. FIX: lower the ceiling to ${g.requests}.`);
    });
}
