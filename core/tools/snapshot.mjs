// Emits a static snapshot of a folder for the code explorer: node core/tools/snapshot.mjs [folder] [output.json]
// With no arguments it runs the SDK build, which writes the SDK's own snapshot (site/files/snapshot.json) and the lean file list
// the live Files page fetches by default (site/files/index.json, issue 196) together with everything else it generates; both are
// deterministic (no timestamp on the list; the snapshot's own "generated" is informational only), so they stay current with the
// sources. A folder argument snapshots that folder with a timestamp. The formats are documented in modules/code-explorer/providers.js:
// snapshot { version, generated, files: [ { path, language, content, symbols } ] }, list { version, files: [ { path, language, lines } ] }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { symbolsOf } from '../modules/code-explorer/symbols.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = new Set(['.css', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.html', '.svg', '.json', '.md', '.cs', '.razor', '.py', '.java', '.go', '.rs', '.sql', '.yml', '.yaml']);
// report.json (the browser attestation) is rewritten by every run, so a snapshot that held it would be stale after each attestation.
const SKIP_FILES = new Set(['snapshot.json', 'index.json', 'sweep-report.json', 'package-lock.json', 'report.json']);
const SKIP_DIRS = new Set(['dist', 'node_modules', '.git', 'bin', 'obj']);
const MAX_BYTES = 512 * 1024;

function walk(dir, skipDirs) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? (skipDirs.has(e.name) ? [] : walk(p, skipDirs)) : [p];
    });
}

export { symbolsOf };

// Text files under `folder`, oversize ones skipped, paths relative to `folder` with forward slashes, sorted by that path (not the
// platform's separator, so every OS produces the same bytes): [ [relativePath, content] ]. `overlay` (relative path -> text) replaces
// what is on disk and adds files not written yet: the build passes what it is about to generate, so nothing here reads a stale file.
function collectEntries(folder, { skipDirs, overlay }) {
    const entries = new Map();
    for (const p of walk(folder, skipDirs)) entries.set(path.relative(folder, p).split(path.sep).join('/'), p);
    for (const rel of overlay.keys()) if (!rel.split('/').some(d => skipDirs.has(d))) entries.set(rel, null);
    return [...entries].filter(([rel, p]) => TEXT.has(path.extname(rel)) && !SKIP_FILES.has(path.basename(rel)) && (p === null ? Buffer.byteLength(overlay.get(rel)) : fs.statSync(p).size) <= MAX_BYTES)
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([rel, p]) => [rel, (overlay.has(rel) ? overlay.get(rel) : fs.readFileSync(p, 'utf8')).replace(/\r\n/g, '\n')]);
}

// The full snapshot document for `folder`: every text file's content and outline embedded. For a SnapshotProvider consumer that
// wants everything in one request; the live site does not use this by default any more (issue 196: LazyProvider fetches same-origin
// on demand instead, so the Files page does not ship a multi-megabyte document up front).
export function collectSnapshot(folder, { skipDirs = SKIP_DIRS, generated = new Date().toISOString(), overlay = new Map() } = {}) {
    const files = collectEntries(folder, { skipDirs, overlay }).map(([rel, content]) => {
        const ext = path.extname(rel).slice(1);
        const language = ext === 'mjs' ? 'js' : ext;
        return { path: rel, language, content, symbols: symbolsOf(content, language) };
    });
    return { version: 1, generated, files };
}

// The lean file list for `folder`: path, language and line count only, no content -- what LazyProvider fetches up front (a few KB
// regardless of how large the tree is); each file's actual text is fetched same-origin, lazily, only once it is opened or searched.
export function collectFileList(folder, { skipDirs = SKIP_DIRS, overlay = new Map() } = {}) {
    const files = collectEntries(folder, { skipDirs, overlay }).map(([rel, content]) => {
        const ext = path.extname(rel).slice(1);
        return { path: rel, language: ext === 'mjs' ? 'js' : ext, lines: content.split('\n').length };
    });
    return { version: 1, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [folder, out] = process.argv.slice(2);
    if (!folder) {
        const { build } = await import('./build.mjs');
        build();
        console.log('site/files/snapshot.json and site/files/index.json written by the build');
    } else {
        const snapshot = collectSnapshot(path.resolve(folder));
        const target = path.resolve(out ?? 'snapshot.json');
        fs.writeFileSync(target, JSON.stringify(snapshot));
        console.log(`${snapshot.files.length} files snapshotted to ${target}`);
    }
}
