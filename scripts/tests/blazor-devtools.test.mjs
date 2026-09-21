// blazor-devtools.js (PlainKit.Blazor's own dev tools panels): the pure parts, and that the panels have the shape mountDevTools takes.
// The .NET side (what the panels read) is tested in blazor/tests. Run: node --test scripts/tests/*.test.mjs
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wwwroot = path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot');
const { ago, factRows, logSummary, blazorPanels, blazorInspectorSections, exampleElement, compact } = await import(pathToFileURL(path.join(wwwroot, 'blazor-devtools.js')).href);

const NOW = Date.parse('2026-01-01T00:10:00Z');
const snapshot = extra => ({
    host: 'Blazor Server', framework: '.NET 10.0.0', packageVersion: '1.2.3', sdkVersion: '1.2.3', runtimeInitialized: true, forwardingToILogger: false, circuit: null,
    interop: { calls: 0, errors: 0, byIdentifier: [], recentErrors: [] }, ...extra,
});

test('ago says how long ago, in the largest sensible unit', () => {
    assert.equal(ago(null, NOW), '-');
    assert.equal(ago('2026-01-01T00:09:57Z', NOW), '3 s');
    assert.equal(ago('2026-01-01T00:08:00Z', NOW), '2 min');
    assert.equal(ago('2025-12-31T21:10:00Z', NOW), '3 h');
    assert.equal(ago('2026-01-01T00:11:00Z', NOW), '0 s', 'a time in the future is not negative');
});

test('facts report the circuit from the .NET side and say so when there is none', () => {
    const value = (rows, name) => rows.find(r => r.name === name)?.value;
    const server = factRows(snapshot({ circuit: { phase: 'Connected', id: 'abc', openedAt: '2026-01-01T00:09:00Z', connectedAt: '2026-01-01T00:09:30Z', disconnects: 2, reconnects: 1 } }), { count: 0, last: '' }, NOW);
    assert.equal(value(server, 'Circuit'), 'Connected');
    assert.equal(value(server, 'Circuit id'), 'abc');
    assert.equal(value(server, 'Open for'), '1 min');
    assert.equal(value(server, 'Connected since'), '30 s ago');
    assert.equal(value(server, 'Connection drops / reconnects'), '2 / 1');
    assert.equal(value(factRows(snapshot(), { count: 0, last: '' }, NOW), 'Circuit'), 'none (not Blazor Server)');
});

test('facts flag a JavaScript version that differs from the package and an unknown one', () => {
    const value = (s, reconnect = { count: 0, last: '' }) => factRows(s, reconnect, NOW).find(r => r.name === 'Plainkit JavaScript').value;
    assert.equal(value(snapshot()), '1.2.3');
    assert.match(value(snapshot({ sdkVersion: '1.0.0' })), /differs from the package/);
    assert.equal(value(snapshot({ sdkVersion: null })), 'unknown');
    const ui = factRows(snapshot(), { count: 2, last: 'failed' }, NOW).find(r => r.name.startsWith('Reconnect UI'));
    assert.equal(ui.value, '2, last: failed');
});

test('log summary counts entries per level and keeps the newest problems first', () => {
    const entries = [
        { level: 'debug', scope: 'a', message: '1' }, { level: 'warn', scope: 'b', message: '2' }, { level: 'info', scope: 'a', message: '3' },
        { level: 'error', scope: 'c', message: '4' }, { level: 'debug', scope: 'a', message: '5' },
    ];
    const s = logSummary(entries);
    assert.equal(s.total, 5);
    assert.deepEqual(s.counts, { debug: 2, info: 1, warn: 1, error: 1 });
    assert.deepEqual(s.problems.map(e => e.message), ['4', '2']);
    assert.equal(logSummary(Array.from({ length: 30 }, (_, i) => ({ level: 'warn', scope: 's', message: String(i) }))).problems.length, 8);
});

test('compact drops what is not there (replaceChildren would print the word null)', () => {
    assert.deepEqual(compact('a', null, undefined, false, 'b'), ['a', 'b']);
});

test('the panels have the shape mountDevTools takes: { id, title, mount }, with ids that do not clash with the SDK ones', () => {
    const panels = blazorPanels({ invokeMethodAsync: async () => null });
    assert.deepEqual(panels.map(p => p.id), ['blazor', 'blazor-components']);
    for (const p of panels) {
        assert.equal(typeof p.title, 'string');
        assert.equal(typeof p.mount, 'function');
    }
    const sdk = fs.readFileSync(path.join(wwwroot, 'plainkit', 'modules', 'devtools', 'devtools.js'), 'utf8') + fs.readFileSync(path.join(wwwroot, 'plainkit', 'modules', 'devtools', 'panels.js'), 'utf8');
    for (const p of panels) assert.ok(!new RegExp(`id: '${p.id}'`).test(sdk), `${p.id} is not an SDK panel id`);
});

test('the inspector section is one { title, render } as createElementInspector takes, and it is built from what the .NET side answers', async () => {
    const calls = [];
    const host = { invokeMethodAsync: async (method, ...args) => { calls.push([method, ...args]); return null; } };
    const sections = blazorInspectorSections(host);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, 'Blazor');
    assert.equal(typeof sections[0].render, 'function');
    assert.equal(sections[0].open, true);
    assert.equal(calls.length, 0, 'nothing is asked until the section renders');
});

test('the example of an element is read from its API entry, detached, so its attributes and text can become Razor', () => {
    const api = JSON.parse(fs.readFileSync(path.join(wwwroot, 'plainkit', 'elements', 'api.json'), 'utf8'));
    assert.ok(api.length > 80);
    // node has no DOM: a minimal document is enough to see which entries the function can read
    const doc = {
        createElement() {
            const template = { content: { querySelector: tag => ({ tag, html: template.html }) } };
            Object.defineProperty(template, 'innerHTML', { set(v) { template.html = v; } });
            return template;
        },
    };
    assert.equal(exampleElement(doc, {}), null, 'an element with no example gives none');
    assert.equal(exampleElement(doc, { tag: 'pk-x', examples: [] }), null);
    assert.equal(exampleElement(doc, { tag: 'pk-x', examples: [{ html: '<pk-x></pk-x>' }] }).tag, 'pk-x');
});
