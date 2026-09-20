// Emits a static snapshot of a folder for the code explorer: node core/tools/snapshot.mjs [folder] [output.json]
// With no arguments it snapshots the SDK's own files into site/files/snapshot.json (the SDK's Files page). The format is documented in
// js/code-explorer/providers.js: { version, generated, files: [ { path, language, content, symbols } ] }.
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

// The snapshot document for `folder`: text files only, oversize files skipped, paths relative to the folder with forward slashes.
export function collectSnapshot(folder, { skipDirs = SKIP_DIRS, generated = new Date().toISOString() } = {}) {
    const files = walk(folder, skipDirs)
        .filter(p => TEXT.has(path.extname(p)) && !SKIP_FILES.has(path.basename(p)) && fs.statSync(p).size <= MAX_BYTES)
        .sort()
        .map(p => {
            const content = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
            const ext = path.extname(p).slice(1);
            return { path: path.relative(folder, p).split(path.sep).join('/'), language: ext === 'mjs' ? 'js' : ext, content, symbols: symbolsOf(content, ext) };
        });
    return { version: 1, generated, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [folder = root, out = path.join(root, 'site', 'files', 'snapshot.json')] = process.argv.slice(2);
    const snapshot = collectSnapshot(path.resolve(folder));
    fs.writeFileSync(path.resolve(out), JSON.stringify(snapshot));
    console.log(`${snapshot.files.length} files snapshotted to ${out}`);
}
