// What ships: the NuGet package (size, and what is in it by folder), and the static web assets it serves, raw / gzip / brotli in total and by folder,
// plus the biggest files. Also the cache-busting facts a host needs: which URLs carry a content hash (?v=) and which do not.
//   node scripts/bench/package.mjs [--nupkg path] [--json file]     (without --nupkg it runs dotnet pack into a temporary folder)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, table, root, gz, br } from './lib.mjs';

// The entries of a zip (a nupkg is one): name, compressed and uncompressed size, read from the central directory. No dependency.
export function zipEntries(buf) {
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('not a zip file');
    const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const out = [];
    for (let i = 0; i < count; i++) {
        const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
        out.push({ name: buf.toString('utf8', p + 46, p + 46 + nameLen), compressed: buf.readUInt32LE(p + 20), size: buf.readUInt32LE(p + 24) });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}
const kb = n => `${(n / 1024).toFixed(1)} KB`;
const group = (entries, depth) => { const g = new Map(); for (const e of entries) { const k = e.name.split('/').slice(0, depth).join('/'); const v = g.get(k) ?? { files: 0, raw: 0, packed: 0 }; v.files++; v.raw += e.size; v.packed += e.compressed; g.set(k, v); } return [...g].map(([k, v]) => ({ folder: k, files: v.files, raw: kb(v.raw), 'in the nupkg': kb(v.packed), _raw: v.raw })).sort((a, b) => b._raw - a._raw); };

export function run({ nupkg = null } = {}) {
    let dir = null;
    if (!nupkg) {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-pack-'));
        const r = spawnSync('dotnet', ['pack', path.join(root, 'blazor', 'src', 'PlainKit.Blazor'), '-c', 'Release', '-o', dir], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error(`dotnet pack failed:\n${r.stdout}${r.stderr}`);
        nupkg = path.join(dir, fs.readdirSync(dir).find(f => f.endsWith('.nupkg') && !f.endsWith('.snupkg')));
    }
    try {
        const buf = fs.readFileSync(nupkg); const entries = zipEntries(buf);
        const tables = [];
        tables.push({ caption: `NuGet package ${path.basename(nupkg)}: ${kb(buf.length)} on disk, ${entries.length} entries, ${kb(entries.reduce((s, e) => s + e.size, 0))} unpacked`, rows: group(entries, 4).slice(0, 14).map(({ _raw, ...r }) => r), cols: ['folder', 'files', 'raw', 'in the nupkg'] });
        const wwwroot = path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot');
        const files = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(f); } }; walk(wwwroot);
        const sized = files.map(f => { const b = fs.readFileSync(f); const compressible = /\.(js|mjs|css|json|html|svg|map|txt|md|ts)$/.test(f); return { file: path.relative(wwwroot, f).replaceAll('\\', '/'), raw: b.length, gzip: compressible ? gz(b) : b.length, brotli: compressible ? br(b) : b.length }; });
        const total = k => sized.reduce((s, f) => s + f[k], 0);
        const byDir = new Map(); for (const f of sized) { const k = f.file.split('/').slice(0, 2).join('/'); const v = byDir.get(k) ?? { files: 0, raw: 0, gzip: 0, brotli: 0 }; v.files++; for (const c of ['raw', 'gzip', 'brotli']) v[c] += f[c]; byDir.set(k, v); }
        tables.push({ caption: `Static web assets (wwwroot): ${sized.length} files, ${kb(total('raw'))} raw, ${kb(total('gzip'))} gzip, ${kb(total('brotli'))} brotli`, rows: [...byDir].sort((a, b) => b[1].raw - a[1].raw).slice(0, 12).map(([k, v]) => ({ folder: k, files: v.files, raw: kb(v.raw), gzip: kb(v.gzip), brotli: kb(v.brotli) })), cols: ['folder', 'files', 'raw', 'gzip', 'brotli'] });
        // What a running app needs (page CSS, the element and helper modules, icons, the Blazor bridge) against what only authoring tools and agents read.
        const runtime = f => /^(plainkit\/(plainkit(\.min)?\.css|plainkit\.js|icons\.svg|js\/|elements\/[\w-]+\.js$)|plainkit\.blazor\.js)/.test(f) || f.endsWith('.lib.module.js');
        const sum = list => ({ files: list.length, raw: kb(list.reduce((s, f) => s + f.raw, 0)), gzip: kb(list.reduce((s, f) => s + f.gzip, 0)), brotli: kb(list.reduce((s, f) => s + f.brotli, 0)) });
        tables.push({ caption: 'Static web assets: needed at runtime vs only read by tools, editors and agents (both are served publicly and compressed at publish)', rows: [{ kind: 'runtime (css, js, elements, icons, bridge)', ...sum(sized.filter(f => runtime(f.file))) }, { kind: 'tooling and docs (api.json, custom-elements.json, web-types, d.ts, skills, gallery, tool modules, manifest)', ...sum(sized.filter(f => !runtime(f.file))) }], cols: ['kind', 'files', 'raw', 'gzip', 'brotli'] });
        tables.push({ caption: 'Largest static files', rows: [...sized].sort((a, b) => b.raw - a.raw).slice(0, 8).map(f => ({ file: f.file, raw: kb(f.raw), gzip: kb(f.gzip), brotli: kb(f.brotli) })), cols: ['file', 'raw', 'gzip', 'brotli'] });
        return { title: 'Package', tables };
    } finally { if (dir) fs.rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const o = parseArgs(process.argv.slice(2));
    const r = run({ nupkg: o.nupkg ?? null });
    for (const t of r.tables) console.log(`\n${t.caption}\n${table(t.rows, t.cols)}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(r, null, 1));
}
