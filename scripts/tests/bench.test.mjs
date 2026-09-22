// The benchmark helpers in scripts/bench/ that need no browser: the statistics, the argument parser, the table printer and the zip reader; and that every
// bench script is described in its README. (The benches themselves drive Chrome and are run by hand: scripts/bench/README.md.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { median, summary, parseArgs, table } from '../bench/lib.mjs';
import { zipEntries } from '../bench/package.mjs';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bench');

test('median takes the middle, or the mean of the two middle values, and does not reorder its input', () => {
    const xs = [5, 1, 3];
    assert.equal(median(xs), 3);
    assert.deepEqual(xs, [5, 1, 3]);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.deepEqual(summary([10, 12, 11, 100, 9]), { median: 11, min: 9, max: 100, runs: 5 });
});

test('parseArgs reads --name=value and bare --flag, and keeps the rest', () => {
    assert.deepEqual(parseArgs(['--only=leaks', '--verbose', 'x', '--n=2000']), { _: ['x'], only: 'leaks', verbose: true, n: '2000' });
});

test('table pads every column to its widest cell', () => {
    const out = table([{ a: 'x', b: 1 }, { a: 'longer', b: 22 }], ['a', 'b']).split('\n');
    assert.equal(out.length, 4);
    assert.ok(out.every(l => l.length === out[0].length), 'all lines are as wide as the header');
});

test('zipEntries lists the names and sizes of a zip from its central directory', () => {
    const files = [['a.txt', Buffer.from('hello hello hello hello')], ['dir/b.json', Buffer.from('{"k":1}')]];
    const locals = [], central = []; let offset = 0;
    for (const [name, data] of files) {
        const packed = zlib.deflateRawSync(data), n = Buffer.from(name);
        const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(n.length, 26);
        const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
        locals.push(local, n, packed); central.push(c, n); offset += 30 + n.length + packed.length;
    }
    const cd = Buffer.concat(central), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    const entries = zipEntries(Buffer.concat([...locals, cd, end]));
    assert.deepEqual(entries.map(e => [e.name, e.size]), [['a.txt', 23], ['dir/b.json', 7]]);
    assert.throws(() => zipEntries(Buffer.from('not a zip')), /not a zip/);
});

test('every bench script is described in the bench README', () => {
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && f !== 'lib.mjs')) assert.ok(readme.includes(`scripts/bench/${f}`), `${f} is not in scripts/bench/README.md`);
});
