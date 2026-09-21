// Emits a static snapshot of a folder for the code explorer: node core/tools/snapshot.mjs [folder] [output.json]
// With no arguments it runs the SDK build, which writes the SDK's own snapshot (site/files/snapshot.json, the Files page) together with everything
// else it generates; that one is deterministic (no timestamp), so it stays current with the sources. A folder argument snapshots that folder with
// a timestamp. The format is documented in modules/code-explorer/providers.js: { version, generated, files: [ { path, language, content, symbols } ] }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = new Set(['.css', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.html', '.svg', '.json', '.md', '.cs', '.razor', '.py', '.java', '.go', '.rs', '.sql', '.yml', '.yaml']);
const SKIP_FILES = new Set(['snapshot.json', 'sweep-report.json', 'package-lock.json']);
const SKIP_DIRS = new Set(['dist', 'node_modules', '.git', 'bin', 'obj']);
const MAX_BYTES = 512 * 1024;

function walk(dir, skipDirs) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? (skipDirs.has(e.name) ? [] : walk(p, skipDirs)) : [p];
    });
}

// Declarations worth listing in the outline: JS/TS functions, classes and consts at the top level, CSS rules with a class selector.
export function symbolsOf(content, ext) {
    const symbols = [];
    const lines = content.split('\n');
    if (['js', 'mjs', 'ts', 'tsx', 'jsx'].includes(ext)) lines.forEach((line, i) => {
        const m = /^(export )?(async )?(function|class|const)\s+([A-Za-z_$][\w$]*)/.exec(line);
        if (m) symbols.push({ kind: m[3], name: m[4], line: i + 1, depth: 0 });
    });
    if (ext === 'css') lines.forEach((line, i) => {
        const m = /^(\.[\w-]+)[^{]*\{/.exec(line);
        if (m) symbols.push({ kind: 'rule', name: m[1], line: i + 1, depth: 0 });
    });
    return symbols;
}

// The snapshot document for `folder`: text files only, oversize files skipped, paths relative to the folder with forward slashes, sorted by
// that path (not by the platform's separator, so every OS produces the same bytes). `overlay` (relative path -> text) replaces what is on disk
// and adds files that are not written yet: the build passes what it is about to generate, so the snapshot never reads a stale generated file.
export function collectSnapshot(folder, { skipDirs = SKIP_DIRS, generated = new Date().toISOString(), overlay = new Map() } = {}) {
    const entries = new Map();
    for (const p of walk(folder, skipDirs)) entries.set(path.relative(folder, p).split(path.sep).join('/'), p);
    for (const rel of overlay.keys()) if (!rel.split('/').some(d => skipDirs.has(d))) entries.set(rel, null);
    const files = [...entries].filter(([rel, p]) => TEXT.has(path.extname(rel)) && !SKIP_FILES.has(path.basename(rel)) && (p === null ? Buffer.byteLength(overlay.get(rel)) : fs.statSync(p).size) <= MAX_BYTES)
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([rel, p]) => {
            const content = (overlay.has(rel) ? overlay.get(rel) : fs.readFileSync(p, 'utf8')).replace(/\r\n/g, '\n');
            const ext = path.extname(rel).slice(1);
            return { path: rel, language: ext === 'mjs' ? 'js' : ext, content, symbols: symbolsOf(content, ext) };
        });
    return { version: 1, generated, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [folder, out] = process.argv.slice(2);
    if (!folder) {
        const { build } = await import('./build.mjs');
        build();
        console.log('site/files/snapshot.json written by the build');
    } else {
        const snapshot = collectSnapshot(path.resolve(folder));
        const target = path.resolve(out ?? 'snapshot.json');
        fs.writeFileSync(target, JSON.stringify(snapshot));
        console.log(`${snapshot.files.length} files snapshotted to ${target}`);
    }
}
