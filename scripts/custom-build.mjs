#!/usr/bin/env node
// The custom SDK from the command line (#124): the same bundle the theme editor's Custom SDK tab exports, made from plainkit.custom.json and the built dist.
//
//   node scripts/custom-build.mjs --config plainkit.custom.json [--dist core/dist] [--out plainkit-custom-<version>.zip] [--check]
//
// There is no second implementation: the settings are read by readSettings (js/custom-sdk-files.js), the dist is read and hash-checked by fetchDist, the bundle is made by
// makeExport (js/custom-sdk.js, custom-sdk-logic.js, custom-sdk-ruler.js) and zipped by zipStore, all the very functions the browser runs. The test
// scripts/tests/custom-build.test.mjs holds the zip equal to the browser's byte for byte. --check validates and builds in memory and writes nothing.
// Exit 0 on success; exit 1 with one "custom-build: ..." line on a bad flag, config, dist or build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSettings } from '../core/js/custom-sdk-files.js';
import { fetchDist, makeExport } from '../core/js/custom-sdk.js';
import { buildOverrides } from '../core/js/theme.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DIST = path.join(here, '..', 'core', 'dist');
export const MAX_CONFIG_BYTES = 1024 * 1024; // a settings file is a few KB; refuse anything absurd before parsing it
const USAGE = 'usage: node scripts/custom-build.mjs --config plainkit.custom.json [--dist <dist folder>] [--out <file.zip>] [--check]';

export function parseArgs(argv) {
    const o = { check: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--check') o.check = true;
        else if (a === '--config' || a === '--dist' || a === '--out') {
            const v = argv[++i];
            if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value. ${USAGE}`);
            o[a.slice(2)] = v;
        } else throw new Error(`unknown argument ${a}. ${USAGE}`);
    }
    if (!o.config) throw new Error(`--config is required. ${USAGE}`);
    return o;
}

// A fetch over a local folder, so fetchDist (the browser's reader, with its hash checks) reads the built dist unchanged. Only paths under the folder are served.
function fileFetch(root) {
    return async url => {
        const file = fileURLToPath(url);
        const rel = path.relative(root, file);
        if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(file)) return { ok: false, status: 404 };
        return { ok: true, status: 200, arrayBuffer: async () => { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } };
    };
}

/** { zip, name, summary } from the text of a settings file and a dist folder. Throws an Error whose message is the whole explanation. */
export async function buildFromSettings(settingsText, distDir) {
    const root = path.resolve(distDir);
    if (!fs.existsSync(path.join(root, 'manifest.json'))) throw new Error(`${root} has no manifest.json: run node scripts/bootstrap.mjs, or pass --dist <the dist folder of a release>`);
    const dist = await fetchDist(pathToFileURL(root + path.sep), { fetchImpl: fileFetch(root) });
    if (!dist.report) throw new Error('the dist has no breakpoints.report.json (the plainkit.tools package carries it): the breakpoint names are unknown');
    const names = dist.report.breakpoints.map(b => b.name);
    const shipped = Object.fromEntries(dist.report.breakpoints.map(b => [b.name, b.width]));
    const read = readSettings(settingsText, names);
    if (read.error) throw new Error(read.error);
    const s = read.settings;
    if (!s.include.theme && !s.include.breakpoints) throw new Error('nothing is included: include.theme or include.breakpoints must be true');
    const theme = { overrides: s.theme, css: buildOverrides(s.theme).css }; // the tab's theme(): the sanitised overrides and the block written from them
    if (s.include.theme && !s.include.breakpoints && Object.values(s.theme).reduce((c, d) => c + Object.keys(d).length, 0) === 0) throw new Error('a theme-only export needs at least one token override');
    return makeExport({ dist, shipped, include: s.include, widths: s.breakpoints, theme, extras: s.extras ?? [] }); // the same function the Custom SDK tab calls
}

export async function main(argv) {
    const o = parseArgs(argv);
    if (!fs.existsSync(o.config) || !fs.statSync(o.config).isFile()) throw new Error(`${o.config} is not a file`);
    if (fs.statSync(o.config).size > MAX_CONFIG_BYTES) throw new Error(`${o.config} is larger than ${MAX_CONFIG_BYTES} bytes: not a plainkit.custom.json`);
    const result = await buildFromSettings(fs.readFileSync(o.config, 'utf8'), o.dist ?? DEFAULT_DIST);
    if (o.check) return `custom-build: ok, ${result.name} would be ${result.zip.length} bytes (nothing written)`;
    const out = path.resolve(o.out ?? result.name);
    if (!out.endsWith('.zip')) throw new Error(`--out must be a .zip file, got ${o.out}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, result.zip);
    return `custom-build: wrote ${out} (${result.zip.length} bytes)`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).then(line => console.log(line), error => { console.error(`custom-build: ${String(error.message ?? error).replace(/^custom-build: /, '')}`); process.exitCode = 1; });
}
