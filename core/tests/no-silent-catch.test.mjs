// Nothing fails silently (issue #16): an empty catch block or an empty .catch handler in runtime source must log or otherwise act on the error,
// or a failure disappears; a comment does not count (issue #513). Scans core/js, core/elements (behaviour files, not the generated *.element.js), core/modules,
// core/site (not the generated data files) and core/samples.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The start of a `catch {`, `catch (e) {` block or a `.catch(() => {`, `.catch(e => {` handler. Its body is what follows up to the first `}`;
// a body with a nested brace is code, never an empty one. A comment is not handling (issue #513): a body of only comments and whitespace is empty.
const HEADS = [/\bcatch\s*(?:\(\s*\w*\s*\))?\s*\{/g, /\.catch\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*\{/g];
const onlyComments = body => body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim() === '';

export function emptyHandlers(text) {
    const out = new Set();
    for (const re of HEADS) {
        for (const m of text.matchAll(re)) {
            const start = m.index + m[0].length;
            const end = text.indexOf('}', start);
            if (end > 0 && onlyComments(text.slice(start, end))) out.add(text.slice(0, m.index).split('\n').length);
        }
    }
    return [...out].sort((a, b) => a - b);
}

const skip = (rel, name) => /\.element\.js$|\.test\.mjs$|\.data\.js$/.test(name) || /(^|\/)(dist|node_modules|tests|data)(\/|$)/.test(rel);

function* walk(dir, rel = '') {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!skip(r + '/', e.name)) yield* walk(dir, r); } else if (/\.(js|mjs)$/.test(e.name) && !skip(r, e.name)) yield r;
    }
}

test('the scanner finds empty handlers, a comment included, and accepts a log call or any code', () => {
    assert.deepEqual(emptyHandlers('a();\ntry { x(); } catch {}\nb();\np.catch(() => {});\nq.catch(e => { });'), [2, 4, 5]);
    assert.deepEqual(emptyHandlers('try { x(); } catch (e) { }'), [1]);
    assert.deepEqual(emptyHandlers('try { x(); } catch { /* why */ }\np.catch(() => { /* why */ });\ntry {} catch (e) { // why\n}\nq.catch(e => {\n    // why\n    /* and why */\n});'), [1, 2, 3, 5]);
    assert.deepEqual(emptyHandlers('try {} catch (e) { log.debug("x", e); }\np.catch(() => null);\np.catch(e => { log.warn("x", e); /* and say so */ });\ntry { x(); } catch { y = { a: 1 }; }'), []);
});

test('no runtime source has a silent catch', () => {
    const bad = [];
    for (const top of ['js', 'elements', 'modules', 'site', 'samples']) {
        const dir = path.join(root, top);
        if (!fs.existsSync(dir)) continue;
        for (const rel of walk(dir)) for (const line of emptyHandlers(fs.readFileSync(path.join(dir, rel), 'utf8').replace(/\r\n/g, '\n'))) bad.push(`core/${top}/${rel}:${line}`);
    }
    assert.deepEqual(bad, [], `catch or .catch handlers with an empty body or only comments (a comment is not handling: log the error with createLogger, or act on it):\n${bad.join('\n')}`);
});
