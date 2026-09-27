// js/zip-store.js on its own: a dependency-free, deterministic, store-only zip writer any consumer app can import directly (not custom-SDK-specific).
// core/tests/custom-sdk-logic.test.mjs still covers it as used by the custom SDK export; this file covers the writer itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { zipStore, crc32 } from '../js/zip-store.js';

const enc = new TextEncoder(); const dec = new TextDecoder();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// An independent reader: the central directory, then each entry's data by its local header. Checks the CRC against gzip's (which carries the CRC-32 of its input).
function unzip(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22; while (v.getUint32(end, true) !== 0x06054b50) end--;
    const n = v.getUint16(end + 10, true); let at = v.getUint32(end + 16, true);
    const out = new Map();
    for (let i = 0; i < n; i++) {
        assert.equal(v.getUint32(at, true), 0x02014b50);
        const method = v.getUint16(at + 10, true), crc = v.getUint32(at + 16, true), size = v.getUint32(at + 24, true), nameLen = v.getUint16(at + 28, true), off = v.getUint32(at + 42, true);
        const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen)); at += 46 + nameLen;
        assert.equal(method, 0, 'stored');
        assert.equal(v.getUint32(off, true), 0x04034b50);
        const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
        const data = bytes.slice(start, start + size);
        const gz = zlib.gzipSync(data); assert.equal(gz.readUInt32LE(gz.length - 8), crc, `${name} crc`);
        out.set(name, data);
    }
    return out;
}

test('entries come back exactly, names are UTF-8, it is deterministic, and it refuses unsafe paths', () => {
    const entries = [{ path: 'a/b.txt', data: enc.encode('hello\r\nworld') }, { path: 'eé.bin', data: Uint8Array.from({ length: 70000 }, (_, i) => i % 251) }, { path: 'empty', data: new Uint8Array(0) }];
    const zip = zipStore(entries);
    const back = unzip(zip);
    assert.deepEqual([...back.keys()], entries.map(e => e.path));
    for (const e of entries) assert.ok(same(back.get(e.path), e.data), e.path);
    assert.ok(same(zip, zipStore(entries)), 'the same input, the same bytes');
    for (const path of ['../x', '/x', 'a\\b', 'a/../b', '']) assert.throws(() => zipStore([{ path, data: new Uint8Array(1) }]), /unsafe path/);
});

test('an empty archive is a valid, empty zip', () => {
    const back = unzip(zipStore([]));
    assert.equal(back.size, 0);
});

test('crc32 matches the known CRC-32 of "123456789"', () => {
    assert.equal(crc32(enc.encode('123456789')), 0xcbf43926);
});

test('more than 65535 entries is refused', () => {
    assert.throws(() => zipStore(Array.from({ length: 0x10000 }, (_, i) => ({ path: `f${i}`, data: new Uint8Array(0) }))), /too many entries/);
});
