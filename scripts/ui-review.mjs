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
// Scenarios (core/tests/review/scenarios/*.js; format in core/tests/review/scenario.js): named, scripted states of a page or element (a menu open, a
// page scrolled, a collapsed rail with a flyout), each rendered to screenshots after its named `shot` steps in the same four combinations (or the subset
// the scenario names) with its own measured expectations checked as code. A failed expectation is an error with a FIX line, like the audits.
//   a plain run also runs the scenarios whose `elements` intersect the changed elements     --scenarios [a,b]   also run these scenarios (all when no names)
//   --scenarios-only [a,b]   only scenarios (the named ones, else those for the changed or --elements/--all elements)
//   review-output/scenario-<name>__<shot>__<desktop|phone>__<light|dark>.png   the visible viewport after the shot step
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
import { combinations, expectationFinding, keyEvents, mouseEvents, scenarioShotName, selectScenarios, stepsFor, validateScenario } from '../core/tests/review/scenario.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VIEWPORTS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 375, height: 812 }];
export const THEMES = ['light', 'dark'];
const SCENARIO_DIR = path.join(root, 'core', 'tests', 'review', 'scenarios');
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
    const o = { elements: [], all: false, base: 'origin/main', out: 'review-output', strict: false, port: 0, timeout: 60, scenarios: null, scenariosOnly: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const value = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`); return v; };
        if (a === '--all') o.all = true;
        else if (a === '--strict') o.strict = true;
        else if (a === '--scenarios' || a === '--scenarios-only') {
            // The names are optional: `--scenarios` alone means every scenario, `--scenarios-only` alone the ones for the changed elements.
            const next = argv[i + 1];
            const names = next !== undefined && !next.startsWith('--') ? (i++, next.split(',').map(x => x.trim()).filter(Boolean)) : null;
            if (a === '--scenarios-only') o.scenariosOnly = true;
            o.scenarios = names ?? (a === '--scenarios' ? 'all' : o.scenarios ?? 'auto');
        }
        else if (a === '--elements') o.elements = value().split(',').map(s => s.trim().replace(/^pk-/, '')).filter(Boolean);
        else if (a === '--base') o.base = value();
        else if (a === '--out') o.out = value();
        else if (a === '--port' || a === '--timeout') { const n = Number(value()); if (!Number.isInteger(n) || n < 0) throw new Error(`${a} needs a whole number`); o[a.slice(2)] = n; }
        else throw new Error(`unknown argument ${a}`);
    }
    if (o.all && o.elements.length) throw new Error('use either --all or --elements, not both');
    if (o.scenarios === null) o.scenarios = 'auto';
    return o;
}

/** The screenshot file name. Pure. */
export const shotName = (tag, index, viewport, theme) => `${tag}__${String(index + 1).padStart(2, '0')}__${viewport}__${theme}.png`;

/** Findings seen in several viewports or themes become one line: { rule, severity, tag, example, path, message, fix, seen: ['phone/dark', ...] }. Pure. */
export function groupFindings(shots) {
    const map = new Map();
    for (const s of shots) for (const f of s.findings) {
        // A scenario's audit findings repeat in every shot of it: one line per scenario naming the shots (an expectation's path already names its shot).
        const key = [s.tag, s.scenario ? '' : s.example, f.rule, f.path].join('|');
        if (!map.has(key)) map.set(key, { ...f, tag: s.tag, example: s.example, title: s.title, seen: [], shots: [] });
        const g = map.get(key);
        const where = `${s.viewport}/${s.theme}`;
        if (!g.seen.includes(where)) g.seen.push(where);
        if (s.scenario && !g.shots.includes(s.example)) g.shots.push(s.example);
    }
    for (const g of map.values()) { if (g.shots.length) g.example = g.shots.length > 3 ? `${g.shots.slice(0, 3).join(', ')} and ${g.shots.length - 3} more` : g.shots.join(', '); else delete g.shots; }
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

/** Every scenario module in core/tests/review/scenarios/, validated. A malformed one is an error naming the file and each problem. */
export async function loadScenarios(dir = SCENARIO_DIR, known = null) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort()) {
        const scenario = (await import(pathToFileURL(path.join(dir, f)).href)).default;
        const bad = validateScenario(scenario, known);
        if (scenario?.name && scenario.name !== f.slice(0, -3)) bad.push(`name "${scenario.name}" must equal the file name "${f.slice(0, -3)}"`);
        if (bad.length) throw new Error(['scenario ' + f + ' is malformed:', ...bad.map(b => '  - ' + b)].join('\n'));
        out.push(scenario);
    }
    const dup = out.map(x => x.name).find((n, i, all) => all.indexOf(n) !== i);
    if (dup) throw new Error(`two scenarios are named ${dup}`);
    return out;
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

// Waits for the review page to say it is ready: its state object, or null when it never did within `timeout` seconds.
async function waitReady(cdp, timeout) {
    for (const start = Date.now(); Date.now() - start < timeout * 1000;) {
        await sleep(150);
        const r = await cdp.send('Runtime.evaluate', { expression: 'window.__review && window.__review.ready ? JSON.stringify(window.__review) : null', returnByValue: true }).catch(() => null);
        if (r?.result?.value) return JSON.parse(r.result.value);
    }
    return null;
}
// Opens a review page at a viewport. The page before it is dropped first (about:blank) and the viewport is set before the real page loads, so no
// element ever reads the previous combination's width (a side nav that saw the phone breakpoint once stayed a drawer at desktop width).
async function openReview(cdp, vp, url) {
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false });
    await sleep(100);
    await cdp.send('Page.navigate', { url });
}
async function evaluate(cdp, expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
}
const pageError = (rule, message, fix) => ({ rule, severity: 'error', path: '', message, fix });
const WIDTH_FIX = 'the emulated viewport was not applied; re-run, and report it if it persists';

/**
 * One scenario in one viewport and theme: open the page, play the steps (real pointer and key events), and after every `shot` step check the
 * scenario's expectations, audit the page and take a screenshot of the visible viewport. Findings go into manifest.shots like an example's.
 */
async function playScenario(cdp, { port, sc, vp, theme, out, manifest, timeout }) {
    const tag = `scenario-${sc.name}`;
    await openReview(cdp, vp, `http://localhost:${port}/tests/review/?scenario=${sc.name}&theme=${theme}`);
    const state = await waitReady(cdp, timeout);
    if (!state) { manifest.notSeen.push({ tag, viewport: vp.name, theme, reason: `the review page did not finish within ${timeout} s` }); return; }
    if (state.error) { manifest.notSeen.push({ tag, viewport: vp.name, theme, reason: state.error }); return; }
    const record = (shot, findings, file, boxes = 0) => manifest.shots.push({ tag, example: shot, title: `${sc.name}: ${shot}`, scenario: sc.name, viewport: vp.name, theme, width: vp.width, file, boxes, findings });
    if (state.viewport.width !== vp.width) record('viewport', [pageError('viewport-width', `the page is ${state.viewport.width}px wide, expected ${vp.width}px: the capture is wrong, not the element`, WIDTH_FIX)], null);
    const keys = async events => { for (const e of events) await cdp.send('Input.dispatchKeyEvent', e); };
    const mouse = async events => { for (const e of events) await cdp.send('Input.dispatchMouseEvent', e); };
    for (const [i, step] of stepsFor(sc, vp.name).entries()) {
        if ('shot' in step) {
            const c = await evaluate(cdp, `window.__rv.check(${JSON.stringify(step.shot)}, ${JSON.stringify({ viewport: vp, theme })})`);
            const findings = [...auditFacts(c.facts), ...c.failures.map(f => expectationFinding(sc.name, step.shot, f))];
            const file = scenarioShotName(sc.name, step.shot, vp.name, theme);
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            fs.writeFileSync(path.join(out, file), Buffer.from(shot.data, 'base64'));
            record(step.shot, findings, file, c.facts.boxes.length);
            continue;
        }
        let r = {};
        if ('click' in step || 'hover' in step) {
            r = await evaluate(cdp, `window.__rv.target(${JSON.stringify(step)})`);
            if (!r.error) { await mouse(mouseEvents('click' in step ? 'click' : 'hover', r.x, r.y)); await evaluate(cdp, 'window.__rv.settle()'); }
        } else if ('key' in step) {
            for (let n = 0; n < (step.times ?? 1); n++) await keys(keyEvents(step.key));
            await evaluate(cdp, 'window.__rv.settle()');
        } else if ('type' in step) {
            await cdp.send('Input.insertText', { text: step.type });
            await evaluate(cdp, 'window.__rv.settle()');
        } else if ('wait' in step) {
            if (step.wait === 'settle') await evaluate(cdp, 'window.__rv.settle()'); else await sleep(step.wait);
        } else {
            if ('focus' in step) await keys(keyEvents('Shift')); // a key press first, so the focus that follows counts as keyboard focus (:focus-visible)
            r = await evaluate(cdp, `window.__rv.apply(${JSON.stringify(step)})`);
        }
        if (r.error) {
            record(`step-${i + 1}`, [pageError('scenario-step', `step ${i + 1} ${JSON.stringify(step)}: ${r.error}`, `the step no longer matches the page: update the selector in core/tests/review/scenarios/${sc.name}.js, or fix the element if it lost that part`)], null);
            return;
        }
    }
}

async function main() {
    let o;
    try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
    ensureGenerated();
    const registry = (await import(pathToFileURL(path.join(root, 'core', 'elements', 'registry.js')).href)).default;
    const known = new Set(Object.keys(registry).map(t => t.slice(3)));
    let all;
    try { all = await loadScenarios(SCENARIO_DIR, known); } catch (e) { console.error(e.message); return 2; }
    const named = Array.isArray(o.scenarios) ? o.scenarios : null;
    let names, why;
    if (o.all) { names = [...known].sort(); why = '--all'; }
    else if (o.elements.length) { names = o.elements; why = '--elements'; const bad = names.filter(n => !known.has(n)); if (bad.length) { console.error(`not elements: ${bad.join(', ')}`); return 2; } }
    else if (named && o.scenariosOnly) { names = []; why = '--scenarios-only'; }
    else {
        let files;
        try { files = changedFiles(o.base); } catch (e) { console.error(e.message); return 2; }
        const c = changedFromFiles(files, known);
        names = c.base ? [...known].sort() : c.names;
        why = c.base ? `a base file (tokens, base CSS, layouts) changed versus ${o.base}: every element` : `changed versus ${o.base}`;
    }
    let scenarios;
    try { scenarios = selectScenarios(all, { names: named, elements: names, every: o.scenarios === 'all' || (o.all && o.scenarios === 'auto') }); } catch (e) { console.error(e.message); return 2; }
    const examples = o.scenariosOnly ? [] : names;
    const out = path.resolve(root, o.out);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const manifest = { generated: new Date().toISOString(), why, elements: examples, scenarios: scenarios.map(s => s.name), viewports: VIEWPORTS, themes: THEMES, shots: [], notSeen: [], timings: {}, summary: null };
    if (!examples.length && !scenarios.length) { console.log(`no element changed versus ${o.base}: nothing to review`); manifest.summary = { errors: 0, warnings: 0, ok: true }; fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2)); return 0; }

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
        if (examples.length) console.log(`reviewing ${examples.length} element(s) (${why}): ${examples.map(n => `pk-${n}`).join(', ')}`);
        if (scenarios.length) console.log(`scenarios (${scenarios.length}): ${scenarios.map(s => s.name).join(', ')}`);

        let t0 = Date.now();
        for (const name of examples) for (const vp of VIEWPORTS) for (const theme of THEMES) {
            const tag = `pk-${name}`;
            await openReview(cdp, vp, `http://localhost:${port}/tests/review/?tag=${tag}&theme=${theme}`);
            const state = await waitReady(cdp, o.timeout);
            if (!state) { manifest.notSeen.push({ tag, viewport: vp.name, theme, reason: `the review page did not finish within ${o.timeout} s` }); continue; }
            if (state.error) { manifest.notSeen.push({ tag, viewport: vp.name, theme, reason: state.error }); continue; }
            for (const [i, ex] of state.examples.entries()) {
                const findings = auditFacts(ex.facts);
                if (state.viewport.width !== vp.width) findings.push(pageError('viewport-width', `the page is ${state.viewport.width}px wide, expected ${vp.width}px: the capture is wrong, not the element`, WIDTH_FIX));
                const file = shotName(tag, i, vp.name, theme);
                // The whole viewport width, so a box that spills past the example's frame shows in the picture and the frame's padding is not cut off.
                const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: ex.rect.y, width: Math.max(vp.width, Math.ceil(ex.rect.x + ex.rect.width)), height: Math.ceil(ex.rect.height), scale: 1 } });
                fs.writeFileSync(path.join(out, file), Buffer.from(shot.data, 'base64'));
                manifest.shots.push({ tag, example: i + 1, title: ex.title, viewport: vp.name, theme, width: vp.width, file, boxes: ex.facts.boxes.length, findings });
            }
            if (!state.examples.length) manifest.notSeen.push({ tag, viewport: vp.name, theme, reason: 'the element has no gallery examples' });
        }
        if (examples.length) manifest.timings.examples = Math.round((Date.now() - t0) / 100) / 10;
        for (const sc of scenarios) {
            t0 = Date.now();
            for (const { viewport, theme } of combinations(sc, VIEWPORTS, THEMES)) await playScenario(cdp, { port, sc, vp: viewport, theme, out, manifest, timeout: o.timeout });
            manifest.timings[sc.name] = Math.round((Date.now() - t0) / 100) / 10;
        }
        const grouped = groupFindings(manifest.shots);
        manifest.findings = grouped;
        manifest.summary = summarize(grouped, { strict: o.strict });
        fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
        for (const f of grouped) { console.log(`${f.severity.toUpperCase()} ${f.tag} #${f.example} ${f.rule}: ${f.message} [${f.seen.join(', ')}]`); console.log(`  FIX: ${f.fix}`); }
        for (const n of manifest.notSeen) console.log(`NOT SEEN ${n.tag} ${n.viewport}/${n.theme}: ${n.reason}`);
        console.log(`time (s): ${Object.entries(manifest.timings).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        console.log(`${manifest.shots.filter(s => s.file).length} screenshots in ${path.relative(root, out) || out}; ${manifest.summary.errors} error(s), ${manifest.summary.warnings} warning(s); manifest.json lists every finding.`);
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
