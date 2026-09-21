// scripts/check-package.mjs: the rules for what the NuGet package contains, and the zip reader under them. Run: node --test scripts/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { checkPackage, listZip, readEntry, inspectNupkg, findNupkg } from '../check-package.mjs';

const GOOD = ['PlainKit.Blazor.nuspec', 'README.md', 'lib/net10.0/PlainKit.Blazor.dll', 'lib/net10.0/PlainKit.Blazor.xml', 'staticwebassets/plainkit/manifest.json',
    'staticwebassets/plainkit/plainkit.css', 'staticwebassets/plainkit/skills/plainkit-sdk/SKILL.md', 'staticwebassets/plainkit/skills/plainkit-blazor/SKILL.md'];
const nuspec = v => `<package><metadata><id>PlainKit.Blazor</id><version>${v}</version></metadata></package>`;
const input = (over = {}) => ({ entries: GOOD, nuspec: nuspec('1.2.3-alpha.1'), fileName: 'PlainKit.Blazor.1.2.3-alpha.1.nupkg', version: '1.2.3-alpha.1', ...over });

test('a good package has no problems', () => assert.deepEqual(checkPackage(input()), []));

test('content/ and contentFiles/ entries are refused', () => {
    const p = checkPackage(input({ entries: [...GOOD, 'content/Generated/generated.manifest.json', 'contentFiles/any/net10.0/x.json'] }));
    assert.equal(p.length, 2);
    assert.match(p[0], /must not contain content\/.*found content\/Generated/);
    assert.match(p[1], /contentFiles\//);
});

test('missing pieces are named', () => {
    const p = checkPackage(input({ entries: GOOD.filter(e => !/dll|plainkit-blazor\/SKILL|manifest\.json$/.test(e) || e.endsWith('.nuspec')) }));
    assert.equal(p.filter(x => x.startsWith('missing')).length, 3);
    assert.ok(p.some(x => /assembly/.test(x)) && p.some(x => /plainkit-blazor skill/.test(x)) && p.some(x => /static web assets/.test(x)));
});

test('the version is stamped: nuspec and file name must equal core/VERSION', () => {
    assert.match(checkPackage(input({ nuspec: nuspec('0.0.1') }))[0], /nuspec version is 0\.0\.1 but core\/VERSION is 1\.2\.3-alpha\.1/);
    assert.match(checkPackage(input({ fileName: 'PlainKit.Blazor.0.0.1.nupkg' }))[0], /file name/);
    assert.match(checkPackage(input({ nuspec: '<package/>' }))[0], /no <version>/);
});

// A tiny zip writer (stored or deflated) so the reader is tested without a zip tool.
function makeZip(files) {
    const local = []; const central = []; let offset = 0;
    for (const [name, data, deflate] of files) {
        const raw = Buffer.from(data); const body = deflate ? zlib.deflateRawSync(raw) : raw; const n = Buffer.from(name);
        const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
        const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(deflate ? 8 : 0, 10); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
        local.push(lh, n, body); central.push(ch, n); offset += 30 + n.length + body.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, cd, end]);
}

test('the zip reader lists entries and reads stored and deflated ones', () => {
    const zip = makeZip([['a.txt', 'hello', false], ['dir/PlainKit.Blazor.nuspec', nuspec('9.9.9'), true]]);
    const list = listZip(zip);
    assert.deepEqual(list.map(e => e.name), ['a.txt', 'dir/PlainKit.Blazor.nuspec']);
    assert.equal(readEntry(zip, list[0]).toString(), 'hello');
    assert.match(readEntry(zip, list[1]).toString(), /<version>9\.9\.9<\/version>/);
    assert.throws(() => listZip(Buffer.from('not a zip at all, definitely')), /not a zip/);
});

test('a .nupkg in a folder is inspected end to end', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-check-package-'));
    try {
        const file = path.join(dir, 'PlainKit.Blazor.1.2.3-alpha.1.nupkg');
        fs.writeFileSync(file, makeZip(GOOD.map(n => [n, n.endsWith('.nuspec') ? nuspec('1.2.3-alpha.1') : 'x', n.endsWith('.nuspec')])));
        assert.equal(findNupkg(dir), file);
        assert.deepEqual(checkPackage(inspectNupkg(file, '1.2.3-alpha.1')), []);
        fs.writeFileSync(path.join(dir, 'other.nupkg'), 'x');
        assert.throws(() => findNupkg(dir), /exactly one/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
