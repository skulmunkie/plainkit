// The UI review: renders the gallery examples of the elements a change touches, saves screenshots and runs geometry and accessibility audits on them.
// Node only, no dependencies: it starts the SDK's own static server, drives a headless Chrome or Edge you already have over the DevTools protocol
// (the browser and profile handling is scripts/attest-browser.mjs's), opens core/tests/review/ once per element, viewport and theme, and writes
//
//   review-output/<tag>__<n>__<desktop|phone>__<light|dark>.png   one screenshot per example (n = the example's number in the gallery)
//   review-output/manifest.json                                    what was rendered, the findings of every audit, what could not be seen
//
//   node scripts/ui-review.mjs                       the elements changed versus origin/main (core/elements/<name>/, blazor/mappings/<name>.json);
//                                                    a change to core/base, core/tokens or core/layouts reviews every element
//   node scripts/ui-review.mjs --elements page-header,breadcrumb   (names or pk- tags)      node scripts/ui-review.mjs --all
//   [--base <ref>] [--out <dir>] [--strict] [--port N] [--timeout <s>]
//
// Combinations: desktop 1280x900 and phone 375x812, each in light and dark. Audits (core/tests/review/audit.js): horizontal overflow, clipped content,
// overlapping siblings, tap targets on the phone, text contrast (WCAG AA), focusable elements with no name, decoration drawn inside a link, images and
// icons with no size. Errors fail the run; warnings are for a person to look at (--strict fails on them too).
// Exit code: 0 no errors, 1 an error finding, 2 the run itself could not finish (no browser, no element, timeout). Browser: PK_CHROME, as attest-browser.mjs.
// The screenshots are for the pull request's reviewer (docs: CONTRIBUTING.md "Reviewing what it looks like"); the folder is git-ignored.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureGenerated } from './generated.mjs';
import { chromeArgs, findChrome, killTree, removeDir } from './attest-browser.mjs';
import { auditFacts, summarize } from '../core/tests/review/audit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VIEWPORTS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 375, height: 812 }];
export const THEMES = ['light', 'dark'];
const BASE_DIRS = [/^core\/(base|tokens|layouts)\//];

/**
 * The element names a list of changed files touches, and whether a base file (tokens, base CSS) changed. Pure.
 * core/elements/<name>/ and blazor/mappings/<name>.json name one element; `known` (the registry's names) drops folders that are not elements.
 */
export function changedFromFiles(files, known = null) {
    const names = new Set();
    let base = false;
    for (const raw of files) {
        const f = raw.replace(/\\/g, '/');
        const m = /^core\/elements\/([^/]+)\//.exec(f) ?? /^blazor\/mappings\/([^/]+)\.json$/.exec(f);
        if (m && (!known || known.has(m[1]))) names.add(m[1]);
        if (BASE_DIRS.some(r => r.test(f))) base = true;
    }
    return { names: [...names].sort(), base };
}

/** Command line to options; an unknown flag is an error message, not a silent default. */
export function parseArgs(argv) {
    const o = { elements: [], all: false, base: 'origin/main', out: 'review-output', strict: false, port: 0, timeout: 60 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const value = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`); return v; };
        if (a === '--all') o.all = true;
        else if (a === '--strict') o.strict = true;
        else if (a === '--elements') o.elements = value().split(',').map(s => s.trim().replace(/^pk-/, '')).filter(Boolean);
        else if (a === '--base') o.base = value();
        else if (a === '--out') o.out = value();
        else if (a === '--port' || a === '--timeout') { const n = Number(value()); if (!Number.isInteger(n) || n < 0) throw new Error(`${a} needs a whole number`); o[a.slice(2)] = n; }
        else throw new Error(`unknown argument ${a}`);
    }
    if (o.all && o.elements.length) throw new Error('use either --all or --elements, not both');
    return o;
}

/** The screenshot file name. Pure. */
export const shotName = (tag, index, viewport, theme) => `${tag}__${String(index + 1).padStart(2, '0')}__${viewport}__${theme}.png`;

/** Findings seen in several viewports or themes become one line: { rule, severity, tag, example, path, message, fix, seen: ['phone/dark', ...] }. Pure. */
export function groupFindings(shots) {
    const map = new Map();
    for (const s of shots) for (const f of s.findings) {
        const key = [s.tag, s.example, f.rule, f.path].join('|');
        if (!map.has(key)) map.set(key, { ...f, tag: s.tag, example: s.example, title: s.title, seen: [] });
        map.get(key).seen.push(`${s.viewport}/${s.theme}`);
    }
    return [...map.values()].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
function changedFiles(base) {
    const mb = git(['merge-base', 'HEAD', base]);
    if (mb.status !== 0) throw new Error(`cannot compare with ${base}: run git fetch origin, or pass --base <ref>`);
    const tracked = git(['diff', '--name-only', mb.stdout.trim()]).stdout;
    const untracked = git(['ls-files', '--others', '--exclude-standard']).stdout;
    return `${tracked}\n${untracked}`.split('\n').filter(Boolean);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

// A DevTools protocol connection to one page: send(method, params) resolves with the result and rejects with the browser's error.
async function connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not open the DevTools connection')); });
    let id = 0; const pending = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(`${m.error.message}`)) : p.res(m.result); } };
    return { send: (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); }), close: () => ws.close() };
}

async function main() {
    let o;
    try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
    ensureGenerated();
    const registry = (await import(pathToFileURL(path.join(root, 'core', 'elements', 'registry.js')).href)).default;
    const known = new Set(Object.keys(registry).map(t => t.slice(3)));
    let names, why;
    if (o.all) { names = [...known].sort(); why = '--all'; }
    else if (o.elements.length) { names = o.elements; why = '--elements'; const bad = names.filter(n => !known.has(n)); if (bad.length) { console.error(`not elements: ${bad.join(', ')}`); return 2; } }
    else {
        let files;
        try { files = changedFiles(o.base); } catch (e) { console.error(e.message); return 2; }
        const c = changedFromFiles(files, known);
        names = c.base ? [...known].sort() : c.names;
        why = c.base ? `a base file (tokens, base CSS, layouts) changed versus ${o.base}: every element` : `changed versus ${o.base}`;
    }
    const out = path.resolve(root, o.out);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const manifest = { generated: new Date().toISOString(), why, elements: names, viewports: VIEWPORTS, themes: THEMES, shots: [], notSeen: [], summary: null };
    if (!names.length) { console.log(`no element changed versus ${o.base}: nothing to review`); manifest.summary = { errors: 0, warnings: 0, ok: true }; fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2)); return 0; }

    let chrome;
    try { chrome = findChrome({ env: process.env, platform: process.platform, pathDirs: (process.env.PATH ?? '').split(path.delimiter).filter(Boolean) }); } catch (e) { console.error(e.message); return 2; }
    if (!chrome) { console.error('No Chrome, Chromium or Edge found. Install one, or set PK_CHROME to its path.'); return 2; }

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-review-'));
    const port = o.port || await freePort();
    let server = null, browser = null, cdp = null, code = 2;
    try {
        server = spawn(process.execPath, [path.join(root, 'core', 'tools', 'serve.mjs'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
        let serverError = '';
        server.stderr.on('data', d => { serverError += d; });
        await new Promise((resolve, reject) => {
            server.once('exit', c => reject(new Error(`the server exited with ${c}: ${serverError.trim() || 'port in use?'}`)));
            server.stdout.on('data', d => { if (String(d).includes('http://localhost')) resolve(); });
            setTimeout(() => reject(new Error('the server did not start within 10 s')), 10000);
        });
        server.removeAllListeners('exit');
        browser = spawn(chrome, [...chromeArgs({ profile, url: 'about:blank', extra: process.env.PK_CHROME_FLAGS }).slice(0, -1), '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore', detached: process.platform !== 'win32' });
        const portFile = path.join(profile, 'DevToolsActivePort');
        for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(150);
        if (!fs.existsSync(portFile)) throw new Error('the browser did not open a DevTools port within 15 s');
        const debugPort = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
        const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        cdp = await connect(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
        await cdp.send('Page.enable');
        console.log(`reviewing ${names.length} element(s) (${why}): ${names.map(n => `pk-${n}`).join(', ')}`);

        for (const name of names) for (const vp of VIEWPORTS) for (const theme of THEMES) {
            const tag = `pk-${name}`;
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false });
            await cdp.send('Page.navigate', { url: `http://localhost:${port}/tests/review/?tag=${tag}&theme=${theme}` });
            let state = null;
            for (const start = Date.now(); Date.now() - start < o.timeout * 1000;) {
                await sleep(150);
                const r = await cdp.send('Runtime.evaluate', { expression: 'window.__review && window.__review.ready ? JSON.stringify(window.__review) : null', returnByValue: true }).catch(() => null);
                if (r?.result?.value) { state = JSON.parse(r.result.value); break; }
            }
            if (!state) { manifest.notSeen.push({ tag, viewport: vp.name, theme, reason: `the review page did not finish within ${o.timeout} s` }); continue; }
            if (state.error) { manifest.notSeen.push({ tag, viewport: vp.name, theme, reason: state.error }); continue; }
            for (const [i, ex] of state.examples.entries()) {
                const findings = auditFacts(ex.facts);
                const file = shotName(tag, i, vp.name, theme);
                const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: ex.rect.x, y: ex.rect.y, width: Math.ceil(ex.rect.width), height: Math.ceil(ex.rect.height), scale: 1 } });
                fs.writeFileSync(path.join(out, file), Buffer.from(shot.data, 'base64'));
                manifest.shots.push({ tag, example: i + 1, title: ex.title, viewport: vp.name, theme, width: vp.width, file, boxes: ex.facts.boxes.length, findings });
            }
            if (!state.examples.length) manifest.notSeen.push({ tag, viewport: vp.name, theme, reason: 'the element has no gallery examples' });
        }
        const grouped = groupFindings(manifest.shots);
        manifest.findings = grouped;
        manifest.summary = summarize(grouped, { strict: o.strict });
        fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
        for (const f of grouped) { console.log(`${f.severity.toUpperCase()} ${f.tag} #${f.example} ${f.rule}: ${f.message} [${f.seen.join(', ')}]`); console.log(`  FIX: ${f.fix}`); }
        for (const n of manifest.notSeen) console.log(`NOT SEEN ${n.tag} ${n.viewport}/${n.theme}: ${n.reason}`);
        console.log(`${manifest.shots.length} screenshots in ${path.relative(root, out) || out}; ${manifest.summary.errors} error(s), ${manifest.summary.warnings} warning(s); manifest.json lists every finding.`);
        code = manifest.summary.ok && !manifest.notSeen.some(n => n.reason !== 'the element has no gallery examples') ? 0 : 1;
    } catch (e) {
        console.error(e.message);
        code = 2;
    } finally {
        try { cdp?.close(); } catch (e) { console.error(`closing the DevTools connection: ${e.message}`); }
        killTree(browser);
        killTree(server);
        await sleep(500);
        if (!(await removeDir(profile))) console.error(`Could not delete the temporary profile ${profile}; delete it by hand.`);
    }
    return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
