// SDK logging (js/log.js): level sources, gating, the ring buffer and sinks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { levelFrom, createLogger, log, setLogLevel, getLogLevel, getLogBuffer, clearLogBuffer, addLogSink, BUFFER_SIZE, LEVELS } from '../js/log.js';

// Capture what reaches the console without printing it.
function capture(fn) {
    const seen = [];
    const original = {};
    for (const m of ['debug', 'info', 'warn', 'error']) { original[m] = console[m]; console[m] = (...args) => seen.push([m, ...args]); }
    try { fn(); } finally { Object.assign(console, original); }
    return seen;
}

test('the level comes from the URL, then the page, then storage, then the default (warn)', () => {
    assert.equal(levelFrom({}), 'warn');
    assert.equal(levelFrom({ stored: 'debug' }), 'debug');
    assert.equal(levelFrom({ stored: 'debug', attr: 'info' }), 'info');
    assert.equal(levelFrom({ stored: 'debug', attr: 'info', search: '?x=1&pk-log=error' }), 'error');
    assert.equal(levelFrom({ search: '?pk-log=SILENT' }), 'silent', 'case-insensitive');
    assert.equal(levelFrom({ search: '?pk-log=loud', attr: 'nonsense', stored: 'trace' }), 'warn', 'invalid values fall through to the default');
});

test('the console shows entries at or above the level and nothing below it', () => {
    clearLogBuffer();
    setLogLevel('warn');
    const l = createLogger('test');
    const seen = capture(() => { l.debug('d'); l.info('i'); l.warn('w', { a: 1 }); l.error('e'); });
    assert.deepEqual(seen.map(s => s[0]), ['warn', 'error']);
    assert.equal(seen[0][1], '[pk:test] w');
    assert.deepEqual(seen[0][2], { a: 1 });
    setLogLevel('debug');
    assert.equal(capture(() => l.debug('now visible')).length, 1);
    setLogLevel('silent');
    assert.equal(capture(() => l.error('muted')).length, 0);
    setLogLevel('warn');
});

test('entries are always buffered (whatever the console level), capped, and copied out', () => {
    clearLogBuffer();
    setLogLevel('error');
    const l = createLogger('buf');
    capture(() => { l.debug('quiet'); });
    assert.equal(getLogBuffer().length, 1);
    assert.equal(getLogBuffer()[0].level, 'debug');
    assert.equal(getLogBuffer()[0].scope, 'buf');
    capture(() => { for (let i = 0; i < BUFFER_SIZE + 25; i++) l.debug(`n${i}`); });
    assert.equal(getLogBuffer().length, BUFFER_SIZE);
    assert.equal(getLogBuffer().at(-1).message, `n${BUFFER_SIZE + 24}`);
    getLogBuffer().pop();
    assert.equal(getLogBuffer().length, BUFFER_SIZE, 'the buffer copy is independent');
    setLogLevel('warn');
});

test('sinks receive every entry, can be removed, and a throwing sink never breaks logging', () => {
    clearLogBuffer();
    setLogLevel('silent');
    const got = [];
    const remove = addLogSink(e => got.push(e));
    const removeBad = addLogSink(() => { throw new Error('boom'); });
    log('info', 'sink', 'one', { x: 1 });
    assert.equal(got.length, 1);
    assert.deepEqual(got[0].detail, { x: 1 });
    remove(); removeBad();
    log('info', 'sink', 'two');
    assert.equal(got.length, 1);
    setLogLevel('warn');
});

test('an invalid level or "silent" as an entry level is ignored, and setLogLevel validates', () => {
    clearLogBuffer();
    assert.equal(log('loud', 's', 'm'), null);
    assert.equal(log('silent', 's', 'm'), null);
    assert.equal(setLogLevel('nope'), false);
    assert.equal(getLogLevel(), 'warn');
    assert.deepEqual([...LEVELS], ['debug', 'info', 'warn', 'error', 'silent']);
    assert.equal(getLogBuffer().length, 0);
});

// ---- routing, per-scope levels, saved settings and the on-page outputs ------------------------------------------------------------
import { normalizeConfig, parseConfig, configureLogging, getLoggingConfig, resetLogging, registerLogOutput, getLogOutputs, DEFAULT_ROUTES, CONFIG_KEY } from '../js/log.js';
import { kindFor, foldEntry, headingFor } from '../js/log-outputs.js';

test('settings are validated: unknown levels, output names and scope names are dropped', () => {
    assert.deepEqual(normalizeConfig(null), {});
    assert.deepEqual(normalizeConfig({ level: 'loud' }), {});
    const n = normalizeConfig({ level: 'info', scopes: { loader: 'debug', 'bad scope!': 'debug', ok: 'nope', __proto__: 'debug' }, routes: { error: ['console', 'toast', 'bad name!', 'toast'], trace: ['console'] } });
    assert.equal(n.level, 'info');
    assert.deepEqual(n.scopes, { loader: 'debug' });
    assert.deepEqual(n.routes, { error: ['console', 'toast'] });
    assert.deepEqual(parseConfig('not json'), {});
    assert.equal(parseConfig('{"level":"error"}').level, 'error');
});

test('a scope can have its own level, above or below the global one', () => {
    resetLogging(); clearLogBuffer();
    configureLogging({ level: 'error', scopes: { chatty: 'debug' } });
    const seen = capture(() => { createLogger('chatty').debug('shown'); createLogger('other').warn('hidden'); createLogger('other').error('shown too'); });
    assert.deepEqual(seen.map(s => s[1]), ['[pk:chatty] shown', '[pk:other] shown too']);
    resetLogging();
});

test('routes send each level to the outputs they name, including your own, and unknown outputs are skipped', () => {
    resetLogging(); clearLogBuffer();
    const got = [];
    const remove = registerLogOutput('mine', e => got.push(`${e.level}:${e.message}`));
    assert.ok(getLogOutputs().includes('console') && getLogOutputs().includes('mine'));
    configureLogging({ level: 'info', routes: { info: ['mine'], warn: ['console', 'mine'], error: ['nowhere-registered-yet-not-lazy'] } });
    const seen = capture(() => { const l = createLogger('r'); l.info('a'); l.warn('b'); l.error('c'); });
    assert.deepEqual(got, ['info:a', 'warn:b']);
    assert.deepEqual(seen.map(s => s[0]), ['warn'], 'info was routed only to mine; warn to both; error to an output that does not exist');
    remove(); resetLogging();
    assert.deepEqual(getLoggingConfig().routes, { ...DEFAULT_ROUTES });
});

test('settings persist when asked, reload from storage and reset clears them', () => {
    const store = new Map();
    const original = globalThis.localStorage;
    globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
    try {
        resetLogging();
        configureLogging({ level: 'debug', scopes: { s: 'error' } });
        assert.equal(store.has(CONFIG_KEY), false, 'not saved unless persist is set');
        configureLogging({ level: 'info' }, { persist: true });
        const saved = JSON.parse(store.get(CONFIG_KEY));
        assert.equal(saved.level, 'info');
        assert.deepEqual(saved.scopes, { s: 'error' }, 'merged, not replaced');
        configureLogging({ scopes: { t: 'debug' } }, { replace: true });
        assert.deepEqual(getLoggingConfig().scopes, { t: 'debug' });
        resetLogging();
        assert.equal(store.has(CONFIG_KEY), false);
        assert.equal(getLogLevel(), 'warn');
    } finally { globalThis.localStorage = original; if (original === undefined) delete globalThis.localStorage; resetLogging(); }
});

test('the on-page outputs map levels to element kinds and fold repeats into one notice with a count', () => {
    assert.deepEqual(['debug', 'info', 'warn', 'error'].map(kindFor), ['info', 'info', 'warning', 'danger']);
    const e = { level: 'warn', scope: 'loader', message: 'x' };
    let r = foldEntry([], e);
    assert.equal(r.isNew, true);
    r = foldEntry(r.list, e);
    assert.equal(r.isNew, false);
    assert.equal(r.entry.count, 2);
    assert.equal(headingFor(r.entry), 'loader (x2)');
    assert.equal(headingFor({ scope: 'a', count: 1 }), 'a');
    let list = [];
    for (let i = 0; i < 8; i++) list = foldEntry(list, { level: 'info', scope: 's', message: `m${i}` }, 5).list;
    assert.equal(list.length, 5);
    assert.equal(list.at(-1).message, 'm7');
});
