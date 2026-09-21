// The pure logic of the logs viewer (js/log-view-logic.js) and the logging settings (js/log-settings-logic.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterLogEntries, scopesOf, countLevels, routeOf, outputLabel, toPlain, describeDetail, rowFor, pushLog, serializeEntries, parseImport, mergeEntries, formatTime } from '../js/log-view-logic.js';
import { draftFrom, configFrom, scopeRows, addScope, removeScope, setScopeLevel, setGlobalLevel, setRoute, routeRows, sameDraft, levelOverride, describeOverride, outputsFor, INHERIT, testMessages, TEST_SCOPE } from '../js/log-settings-logic.js';

const at = 1_700_000_000_000;
const e = (level, scope, message, extra = {}) => ({ id: extra.id ?? 0, at: extra.at ?? at, level, scope, message, ...extra });
const sample = [e('debug', 'loader', 'loaded pk-tabs', { id: 1 }), e('info', 'invokers', 'wired 3', { id: 2 }), e('warn', 'loader', 'slow fetch', { id: 3 }), e('error', 'checkout', 'Payment failed', { id: 4 })];

test('filter by minimum level, scope list and text (message or scope, case-insensitive)', () => {
    assert.equal(filterLogEntries(sample).length, 4);
    assert.deepEqual(filterLogEntries(sample, { minLevel: 'warn' }).map(x => x.id), [3, 4]);
    assert.deepEqual(filterLogEntries(sample, { scopes: ['loader'] }).map(x => x.id), [1, 3]);
    assert.deepEqual(filterLogEntries(sample, { scopes: ['loader', 'checkout'], minLevel: 'warn' }).map(x => x.id), [3, 4]);
    assert.deepEqual(filterLogEntries(sample, { text: ' PAYMENT ' }).map(x => x.id), [4]);
    assert.deepEqual(filterLogEntries(sample, { text: 'invok' }).map(x => x.id), [2], 'the scope is searched too');
    assert.deepEqual(filterLogEntries(sample, { minLevel: 'nonsense' }).length, 4);
});

test('scopes seen are distinct and sorted; counts are per level', () => {
    assert.deepEqual(scopesOf(sample), ['checkout', 'invokers', 'loader']);
    assert.deepEqual(scopesOf(sample, ['app', 'loader']), ['app', 'checkout', 'invokers', 'loader']);
    assert.deepEqual(countLevels(sample), { debug: 1, info: 1, warn: 1, error: 1 });
});

test('an entry below the level for its scope is "buffered only"; otherwise it names its outputs', () => {
    const config = { level: 'warn', scopes: { loader: 'debug' }, routes: { debug: ['console'], info: ['console'], warn: ['console', 'toast'], error: [] } };
    assert.equal(routeOf(sample[0], config).below, false, 'a scope level beats the global one');
    assert.equal(routeOf(sample[1], config).below, true);
    assert.equal(outputLabel(sample[1], config), 'buffered only');
    assert.equal(outputLabel(sample[2], config), 'console, toast');
    assert.equal(outputLabel(sample[3], config), 'no output');
    assert.equal(routeOf(sample[2], { level: 'silent', scopes: {}, routes: {} }).below, true);
});

test('formatTime is a clock with milliseconds; a bad time is empty', () => {
    assert.match(formatTime(at), /^\d\d:\d\d:\d\d\.\d{3}$/);
    assert.equal(formatTime('nope'), '');
});

test('toPlain cuts cycles, names functions, and turns errors and dates into data', () => {
    const cyc = { a: 1 }; cyc.self = cyc;
    assert.deepEqual(toPlain(cyc), { a: 1, self: '[circular]' });
    assert.equal(toPlain(() => 1).startsWith('[function'), true);
    assert.equal(toPlain(undefined), null);
    assert.equal(toPlain(10n), '10');
    const err = toPlain(new Error('boom', { cause: 'root' }));
    assert.equal(err.name, 'Error'); assert.equal(err.message, 'boom'); assert.equal(err.cause, 'root'); assert.match(err.stack, /boom/);
    assert.equal(toPlain(new Date(0)), '1970-01-01T00:00:00.000Z');
    const shared = { x: 1 };
    assert.deepEqual(toPlain({ a: shared, b: shared }), { a: { x: 1 }, b: { x: 1 } }, 'the same object twice is not a cycle');
});

test('describeDetail: nothing, an Error as its stack, a string as itself, an object as JSON, and huge output is capped', () => {
    assert.deepEqual(describeDetail(undefined), { kind: 'none', text: '' });
    const err = describeDetail(new TypeError('bad'));
    assert.equal(err.kind, 'error'); assert.match(err.text, /TypeError: bad/);
    assert.deepEqual(describeDetail('plain'), { kind: 'text', text: 'plain' });
    const obj = describeDetail({ a: [1, 2], nested: { err: new Error('inner') } });
    assert.equal(obj.kind, 'json'); assert.equal(JSON.parse(obj.text).nested.err.message, 'inner');
    const big = describeDetail({ s: 'x'.repeat(500) }, 100);
    assert.match(big.text, /more characters$/);
    assert.equal(describeDetail(null).text, 'null');
});

test('rowFor makes one line of a multi-line message and adds where it went', () => {
    const r = rowFor(e('warn', 'loader', 'a\n  b\tc', { id: 9 }), { level: 'warn', scopes: {}, routes: { warn: ['console'] } });
    assert.equal(r.id, 9); assert.equal(r.message, 'a b c'); assert.equal(r.output, 'console'); assert.equal(r.level, 'warn');
});

test('pushLog keeps the newest', () => {
    let list = [];
    for (let i = 0; i < 5; i++) list = pushLog(list, e('info', 's', String(i), { id: i }), 3);
    assert.deepEqual(list.map(x => x.id), [2, 3, 4]);
});

test('export then import round-trips entries, details included', () => {
    const entries = [e('error', 'checkout', 'failed', { id: 1, detail: { order: 7, err: new Error('declined') } }), e('info', 'app', 'hello', { id: 2, at: at + 5 })];
    const text = serializeEntries(entries, at);
    const file = JSON.parse(text);
    assert.equal(file.format, 'plainkit-log'); assert.equal(file.entries[0].at, new Date(at).toISOString());
    const back = parseImport(text);
    assert.equal(back.skipped, 0); assert.equal(back.error, undefined);
    assert.deepEqual(back.entries.map(x => [x.at, x.level, x.scope, x.message]), [[at, 'error', 'checkout', 'failed'], [at + 5, 'info', 'app', 'hello']]);
    assert.equal(back.entries[0].detail.err.message, 'declined');
});

test('import accepts a bare array, skips invalid entries and reports unreadable files', () => {
    const r = parseImport(JSON.stringify([{ at, level: 'warn', scope: 's', message: 'ok' }, { at, level: 'loud', scope: 's', message: 'bad level' }, { level: 'warn', scope: 's', message: 'no time' }, null, { at: 'yesterday', level: 'info', scope: 's', message: 'x' }, { at: 5, level: 'info', scope: 's', message: 'numeric time' }]));
    assert.equal(r.entries.length, 2); assert.equal(r.skipped, 4);
    assert.match(parseImport('not json').error, /JSON/);
    assert.match(parseImport('{"a":1}').error, /No entries/);
    assert.match(parseImport('[{"nope":1}]').error, /No valid/);
    assert.equal(parseImport(JSON.stringify([{ at, level: 'info', scope: 'x'.repeat(61), message: 'm' }])).entries.length, 0, 'a scope over 60 characters is refused');
});

test('mergeEntries orders by time, ids continue, and the cap keeps the newest', () => {
    const base = [e('info', 'a', '1', { id: 1, at: 100 }), e('info', 'a', '3', { id: 2, at: 300 })];
    const m = mergeEntries(base, [{ at: 200, level: 'warn', scope: 'b', message: '2' }], 3, 10);
    assert.deepEqual(m.entries.map(x => x.message), ['1', '2', '3']); assert.equal(m.entries[1].imported, true); assert.equal(m.nextId, 4);
    assert.deepEqual(mergeEntries(base, [{ at: 200, level: 'warn', scope: 'b', message: '2' }], 3, 2).entries.map(x => x.message), ['2', '3']);
});

// ---- settings ----------------------------------------------------------------------------------------------------------

test('a draft carries the global level, a row per scope seen and every level routed, and turns back into a valid config', () => {
    const config = { level: 'info', scopes: { loader: 'debug' }, routes: { debug: ['console'], info: ['console'], warn: ['console', 'toast'], error: ['console', 'alert'] } };
    const draft = draftFrom(config, ['invokers', 'loader']);
    assert.deepEqual(draft.scopes, { invokers: INHERIT, loader: 'debug' });
    assert.deepEqual(scopeRows(draft).map(r => [r.scope, r.level]), [['invokers', 'inherit'], ['loader', 'debug']]);
    assert.deepEqual(configFrom(draft), { level: 'info', scopes: { loader: 'debug' }, routes: config.routes }, 'inherit rows are not saved');
    assert.deepEqual(draftFrom({}).routes.warn, ['console'], 'missing routes fall back to the default');
    assert.equal(draftFrom({ level: 'loud' }).level, 'warn');
});

test('editing a draft: scope names are validated, added once, changed and removed', () => {
    let draft = draftFrom({ level: 'warn' });
    assert.match(addScope(draft, '   ').error, /Type a scope/);
    assert.match(addScope(draft, 'bad name!').error, /letters/);
    assert.match(addScope(draft, 'x'.repeat(61)).error, /letters/);
    const added = addScope(draft, ' checkout ');
    assert.equal(added.error, undefined); assert.equal(added.scope, 'checkout'); draft = added.draft;
    assert.match(addScope(draft, 'checkout').error, /already/);
    draft = setScopeLevel(draft, 'checkout', 'debug');
    assert.deepEqual(configFrom(draft).scopes, { checkout: 'debug' });
    assert.equal(setScopeLevel(draft, 'checkout', 'loud'), draft, 'an unknown level changes nothing');
    assert.equal(setScopeLevel(draft, 'ghost', 'debug'), draft);
    draft = removeScope(draft, 'checkout');
    assert.deepEqual(draft.scopes, {});
    assert.equal(setGlobalLevel(draft, 'silent').level, 'silent'); assert.equal(setGlobalLevel(draft, 'x'), draft);
});

test('routing: on and off per level and output, custom outputs listed, rows for a grid', () => {
    let draft = draftFrom({});
    draft = setRoute(draft, 'error', 'toast', true);
    draft = setRoute(draft, 'error', 'toast', true);
    draft = setRoute(draft, 'warn', 'console', false);
    assert.deepEqual(draft.routes.error, ['console', 'toast']); assert.deepEqual(draft.routes.warn, []);
    assert.equal(setRoute(draft, 'silent', 'toast', true), draft);
    const outputs = outputsFor(['console', 'telemetry'], draft.routes);
    assert.deepEqual(outputs, ['console', 'toast', 'alert', 'telemetry']);
    assert.deepEqual(routeRows(draft, outputs).find(r => r.level === 'error'), { id: 'error', level: 'error', console: true, toast: true, alert: false, telemetry: false });
    assert.deepEqual(configFrom(draft).routes.warn, [], 'a level sent nowhere is kept as empty');
});

test('sameDraft ignores scopes that only inherit', () => {
    const a = draftFrom({ level: 'warn' }, ['x']);
    assert.equal(sameDraft(a, draftFrom({ level: 'warn' })), true);
    assert.equal(sameDraft(a, setGlobalLevel(a, 'debug')), false);
});

test('the URL and the page attribute override the saved level, in that order', () => {
    assert.equal(levelOverride({}), null);
    assert.deepEqual(levelOverride({ search: '?pk-log=DEBUG', attr: 'info' }), { source: 'url', level: 'debug' });
    assert.deepEqual(levelOverride({ search: '?pk-log=loud', attr: 'info' }), { source: 'attribute', level: 'info' });
    assert.equal(describeOverride(levelOverride({ search: '?pk-log=error' })), '?pk-log=error in the address');
    assert.equal(describeOverride(null), '');
});

test('the test sends one message per level under settings-test', () => {
    assert.deepEqual(testMessages().map(m => m[0]), ['debug', 'info', 'warn', 'error']);
    assert.equal(TEST_SCOPE, 'settings-test');
});
