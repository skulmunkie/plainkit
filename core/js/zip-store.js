// A store-only zip writer (no compression), enough for the custom SDK export: no dependencies, no DOM, deterministic (a fixed timestamp), UTF-8 names.
//
//   const bytes = zipStore([{ path: 'dist/plainkit.css', data: Uint8Array }, ...]);   // -> Uint8Array of a .zip any unzip tool opens
//
// Limits are the classic zip ones (no zip64): at most 65535 entries, and neither an entry nor the archive reaches 4 GiB; beyond that it throws.
const enc = new TextEncoder();
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();

/** The CRC-32 of some bytes (the zip checksum). */
export function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

const DOS_DATE = 0x0021;   // 1980-01-01, time 00:00: the same bytes every time
const FLAG_UTF8 = 0x0800;

export function zipStore(entries) {
    if (entries.length > 0xffff) throw new RangeError('zip: too many entries (65535 at most)');
    const locals = []; const centrals = []; let offset = 0;
    for (const { path, data } of entries) {
        if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) throw new RangeError(`zip: unsafe path "${path}"`);
        const name = enc.encode(path);
        if (data.length >= 0xffffffff) throw new RangeError(`zip: ${path} is too large`);
        const crc = crc32(data);
        const local = new DataView(new ArrayBuffer(30)); const central = new DataView(new ArrayBuffer(46));
        local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, FLAG_UTF8, true); local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, DOS_DATE, true);
        local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
        central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(8, FLAG_UTF8, true); central.setUint16(10, 0, true); central.setUint16(12, 0, true); central.setUint16(14, DOS_DATE, true);
        central.setUint32(16, crc, true); central.setUint32(20, data.length, true); central.setUint32(24, data.length, true); central.setUint16(28, name.length, true);
        central.setUint32(42, offset, true);
        locals.push(new Uint8Array(local.buffer), name, data);
        centrals.push(new Uint8Array(central.buffer), name);
        offset += 30 + name.length + data.length;
    }
    const size = centrals.reduce((n, p) => n + p.length, 0);
    if (offset + size + 22 >= 0xffffffff) throw new RangeError('zip: the archive is too large (4 GiB at most)');
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}
