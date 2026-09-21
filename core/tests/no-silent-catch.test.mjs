// Nothing fails silently (issue #16): an empty catch block or an empty .catch handler in runtime source must say why it is empty (a comment)
// or log; otherwise a failure disappears. Scans core/js, core/elements (behaviour files, not the generated *.element.js), core/modules,
// core/site (not the generated data files) and core/samples.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// An empty `catch {}` / `catch (e) {}` block, or `.catch(() => {})` / `.catch(e => {})`: nothing between the braces, not even a comment.
const EMPTY = [/\bcatch\s*(?:\(\s*\w*\s*\))?\s*\{\s*\}/g, /\.catch\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*\{\s*\}\s*\)/g];

export function emptyHandlers(text) {
    const out = [];
    for (const re of EMPTY) for (const m of text.matchAll(re)) out.push(text.slice(0, m.index).split('\n').length);
    return out.sort((a, b) => a - b);
}

const skip = (rel, name) => /\.element\.js$|\.test\.mjs$|\.data\.js$/.test(name) || /(^|\/)(dist|node_modules|tests|data)(\/|$)/.test(rel);

function* walk(dir, rel = '') {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!skip(r + '/', e.name)) yield* walk(dir, r); } else if (/\.(js|mjs)$/.test(e.name) && !skip(r, e.name)) yield r;
    }
}

test('the scanner finds empty handlers and accepts a comment or a log call', () => {
    assert.deepEqual(emptyHandlers('a();\ntry { x(); } catch {}\nb();\np.catch(() => {});\nq.catch(e => { });'), [2, 4, 5]);
    assert.deepEqual(emptyHandlers('try { x(); } catch (e) { }'), [1]);
    assert.deepEqual(emptyHandlers('try { x(); } catch { /* why */ }\np.catch(() => { /* why */ });\ntry {} catch (e) { log.debug("x", e); }\np.catch(() => null);'), []);
});

test('no runtime source has a silent catch', () => {
    const bad = [];
    for (const top of ['js', 'elements', 'modules', 'site', 'samples']) {
        const dir = path.join(root, top);
        if (!fs.existsSync(dir)) continue;
        for (const rel of walk(dir)) for (const line of emptyHandlers(fs.readFileSync(path.join(dir, rel), 'utf8').replace(/\r\n/g, '\n'))) bad.push(`core/${top}/${rel}:${line}`);
    }
    assert.deepEqual(bad, [], `empty catch or .catch handlers with neither a log call nor a comment:\n${bad.join('\n')}`);
});
