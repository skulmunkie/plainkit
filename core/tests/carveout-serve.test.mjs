// Carve-out, split for parallelism (issue #1107): the copy serves every page, template and fragment (plain, with --csp, under a prefix).
// One file, one copy; the three servers share it read-only (each on its own port).
import test from 'node:test';
import assert from 'node:assert/strict';
import { skip, walk, rel, makeCopy, removeCopy, serve, crawl } from './carveout-helpers.mjs';

let copy;
test('copy the Plainkit folder outside the repository', { skip }, () => { copy = makeCopy(); });

for (const [name, args, prefix] of [['plain', [], ''], ['under a CSP header', ['--csp'], ''], ['under a /sdk/1.0.0/ prefix', ['--base=/sdk/1.0.0/'], '/sdk/1.0.0']]) {
    test(`the copy serves every page, template and fragment (${name}) with no failed sub-request`, { skip }, async () => {
        const { port, proc } = await serve(copy, args);
        try {
            const origin = `http://localhost:${port}${prefix}`;
            const pages = walk(copy).map(f => rel(copy, f)).filter(r => /\.html$/.test(r) && !r.startsWith('dist/'));
            assert.ok(pages.length > 40);
            let total = 0; const failures = [];
            for (const p of pages) { const c = await crawl(origin, `${origin}/${p}`); total += c.count; failures.push(...c.failures); }
            assert.deepEqual([...new Set(failures)], []);
            assert.ok(total > 300, `crawled ${total} resources`);
            if (args.includes('--csp')) { const header = (await fetch(`${origin}/index.html`)).headers.get('content-security-policy') ?? ''; assert.match(header, /script-src 'self'/); assert.match(header, /style-src 'self'(?!\s+'unsafe-inline')/); assert.doesNotMatch(header, /unsafe-inline/); }
            if (prefix) assert.equal((await fetch(`http://localhost:${port}/site/gallery/index.html`)).status, 404, 'outside the prefix nothing is served');
        } finally { const gone = new Promise(r => proc.once('exit', r)); proc.kill(); await Promise.race([gone, new Promise(r => setTimeout(r, 2000))]); }
    });
}

test('clean up the copy', { skip }, () => removeCopy(copy));
