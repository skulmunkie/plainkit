// Reads the AssemblyRef table of a managed assembly (ECMA-335), node only: [{ name, version: 'a.b.c.d' }]. Used by check-package.mjs to see which
// Microsoft.CodeAnalysis version the packed analyzer needs (#2061). Throws on anything that is not a managed PE file.

// Column kinds: 1, 2, 4 = fixed bytes; T(n) = index into table n; 'S' string heap, 'G' guid heap, 'B' blob heap; number = simple table index; array = coded index [bits, ...tables].
const TDR = [2, 0x02, 0x01, 0x1b], HCA = [5, 0x06, 0x04, 0x01, 0x02, 0x08, 0x09, 0x0a, 0x00, 0x0e, 0x17, 0x14, 0x11, 0x1a, 0x1b, 0x20, 0x23, 0x26, 0x27, 0x28, 0x2a, 0x2c, 0x2b];
const T = n => ({ t: n });
const MDM = [1, 0x06, 0x0a];
const TABLES = {
    0x00: [2, 'S', 'G', 'G', 'G'], 0x01: [[2, 0x00, 0x1a, 0x23, 0x01], 'S', 'S'], 0x02: [4, 'S', 'S', TDR, T(4), T(6)], 0x03: [T(4)], 0x04: [2, 'S', 'B'],
    0x05: [T(6)], 0x06: [4, 2, 2, 'S', 'B', T(8)], 0x07: [T(8)], 0x08: [2, 2, 'S'], 0x09: [T(2), TDR], 0x0a: [[3, 0x02, 0x01, 0x1a, 0x06, 0x1b], 'S', 'B'],
    0x0b: [2, [2, 0x04, 0x08, 0x17], 'B'], 0x0c: [HCA, [3, 0x00, 0x00, 0x06, 0x0a, 0x00], 'B'], 0x0d: [[1, 0x04, 0x08], 'B'], 0x0e: [2, [2, 0x02, 0x06, 0x20], 'B'],
    0x0f: [2, 4, T(2)], 0x10: [4, T(4)], 0x11: ['B'], 0x12: [T(2), T(0x14)], 0x13: [T(0x14)], 0x14: [2, 'S', TDR], 0x15: [T(2), T(0x17)], 0x16: [T(0x17)], 0x17: [2, 'S', 'B'],
    0x18: [2, T(6), [1, 0x14, 0x17]], 0x19: [T(2), MDM, MDM], 0x1a: ['S'], 0x1b: ['B'], 0x1c: [2, [1, 0x04, 0x06], 'S', T(0x1a)], 0x1d: [4, T(4)], 0x1e: [4, 4], 0x1f: [4],
    0x20: [4, 2, 2, 2, 2, 4, 'B', 'S', 'S'], 0x21: [4], 0x22: [4, 4, 4], 0x23: [2, 2, 2, 2, 4, 'B', 'S', 'S', 'B'],
};

export function readAssemblyRefs(buf) {
    if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('not a PE file');
    const pe = buf.readUInt32LE(0x3c);
    if (buf.readUInt32LE(pe) !== 0x4550) throw new Error('not a PE file (no PE signature)');
    const nsec = buf.readUInt16LE(pe + 6), optSize = buf.readUInt16LE(pe + 20), opt = pe + 24;
    const plus = buf.readUInt16LE(opt) === 0x20b;
    const clrRva = buf.readUInt32LE(opt + (plus ? 112 : 96) + 14 * 8);
    if (!clrRva) throw new Error('not a managed assembly');
    const sections = [];
    for (let i = 0; i < nsec; i++) { const s = opt + optSize + i * 40; sections.push({ va: buf.readUInt32LE(s + 12), size: Math.max(buf.readUInt32LE(s + 8), buf.readUInt32LE(s + 16)), raw: buf.readUInt32LE(s + 20) }); }
    const off = rva => { const s = sections.find(x => rva >= x.va && rva < x.va + x.size); if (!s) throw new Error('bad RVA'); return s.raw + rva - s.va; };
    const md = off(buf.readUInt32LE(off(clrRva) + 8));
    if (buf.readUInt32LE(md) !== 0x424a5342) throw new Error('no metadata root');
    let p = md + 12; p += 4 + buf.readUInt32LE(p);
    const nStreams = buf.readUInt16LE(p + 2); p += 4;
    const streams = {};
    for (let i = 0; i < nStreams; i++) {
        const o = buf.readUInt32LE(p), n = buf.readUInt32LE(p + 4); let e = p + 8; while (buf[e]) e++;
        streams[buf.toString('latin1', p + 8, e)] = { start: md + o, size: n }; p = (e + 4) & ~3;
    }
    const t = streams['#~'] ?? streams['#-'], strings = streams['#Strings'];
    if (!t || !strings) throw new Error('no metadata tables');
    const heaps = buf[t.start + 6], valid = buf.readBigUInt64LE(t.start + 8);
    const rows = new Array(64).fill(0); p = t.start + 24;
    for (let i = 0; i < 64; i++) if (valid >> BigInt(i) & 1n) { rows[i] = buf.readUInt32LE(p); p += 4; }
    const heap = bit => (heaps & bit ? 4 : 2);
    const size = c => {
        if (typeof c === 'number') return c;
        if (!Array.isArray(c) && typeof c === 'object') return rows[c.t] < 65536 ? 2 : 4;
        if (c === "S") return heap(1); if (c === "G") return heap(2); if (c === "B") return heap(4);
        const [bits, ...tabs] = c; return Math.max(...tabs.map(x => rows[x])) < (1 << (16 - bits)) ? 2 : 4;
    };
    let rowStart = p; const starts = {};
    for (let i = 0; i < 0x24; i++) {
        starts[i] = rowStart;
        const cols = TABLES[i].map(size);
        rowStart += rows[i] * cols.reduce((a, b) => a + b, 0);
    }
    const cols = TABLES[0x23].map(size), str = i => { let e = strings.start + i; while (buf[e]) e++; return buf.toString('utf8', strings.start + i, e); };
    const out = []; let q = starts[0x23];
    for (let r = 0; r < rows[0x23]; r++) {
        const v = [buf.readUInt16LE(q), buf.readUInt16LE(q + 2), buf.readUInt16LE(q + 4), buf.readUInt16LE(q + 6)];
        q += 12; q += cols[5]; const si = cols[6] === 4 ? buf.readUInt32LE(q) : buf.readUInt16LE(q); q += cols[6] + cols[7] + cols[8];
        out.push({ name: str(si), version: v.join('.') });
    }
    return out;
}

