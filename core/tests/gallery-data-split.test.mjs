// The gallery data is split (issue 282): gallery.data.js holds the element index, each element's full meta is its own chunk under site/gallery/elements/.
// The snapshot's per-file cap (MAX_BYTES) is unchanged, so each generated file must stay under it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../tools/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAP = 512 * 1024;
const data = await import('../site/gallery/gallery.data.js');

test('every element appears exactly once in the index and its chunk agrees with it', async () => {
    const tags = data.ELEMENTS.map(e => e.tag);
    assert.equal(new Set(tags).size, tags.length, 'a tag is listed twice');
    const dirs = fs.readdirSync(path.join(root, 'elements'), { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(root, 'elements', d.name, `${d.name}.meta.json`))).map(d => d.name).sort();
    assert.deepEqual(data.ELEMENTS.map(e => e.name).sort(), dirs, 'the index lists every element folder once');
    const all = await data.loadAllElements();
    assert.equal(all.length, tags.length);
    all.forEach((meta, i) => {
        const e = data.ELEMENTS[i];
        for (const k of ['tag', 'title', 'group', 'summary']) assert.equal(meta[k], e[k], `${e.tag}: index ${k} differs from the chunk`);
        assert.ok(Array.isArray(meta.examples) && meta.examples.length, `${e.tag}: chunk has no examples`);
    });
    assert.equal(await data.loadElement('pk-nope'), undefined);
    assert.equal(await data.loadElement(tags[0]), all[0], 'a chunk loads once');
});

test('the index carries no bulky fields, and every generated data file is under the snapshot cap', () => {
    for (const e of data.ELEMENTS) assert.deepEqual(Object.keys(e), ['tag', 'name', 'title', 'group', 'summary']);
    const { out } = build({ write: false });
    const files = [...out].filter(([f]) => f === 'site/gallery/gallery.data.js' || f.startsWith('site/gallery/elements/'));
    assert.equal(files.length, data.ELEMENTS.length + 1);
    for (const [f, text] of files) assert.ok(Buffer.byteLength(text) <= CAP, `${f} is over the ${CAP} byte snapshot cap`);
    for (const e of data.ELEMENTS) assert.ok(out.has(`dist/gallery/elements/${e.name}.data.js`), `${e.name} chunk is in dist/gallery`);
});
