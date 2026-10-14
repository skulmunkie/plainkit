// The pure parts of scripts/blazor-browser.mjs (#1320): the command line, the screenshot names, the error filter. The browser run itself is opt-in (verify --blazor-browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, shotName, errorsIn, VIEWPORTS } from '../blazor-browser.mjs';
import { CASES, SHOT_PLAN } from '../blazor-browser-cases.mjs';

test('parseArgs: defaults, the options and a refused one', () => {
    const d = parseArgs([]);
    assert.equal(d.shots, true);
    assert.deepEqual(d.cases, []);
    assert.deepEqual(parseArgs(['--no-shots', '--cases', 'a, b', '--timeout', '30']).cases, ['a', 'b']);
    assert.throws(() => parseArgs(['--timeout', 'x']), /positive whole number/);
    assert.throws(() => parseArgs(['--cases']), /needs a value/);
    assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('shotName follows the ui-review scenario convention', () => {
    assert.equal(shotName('refusal', VIEWPORTS[1], 'dark'), 'blazor-app__refusal__phone__dark.png');
});

test('errorsIn keeps console errors, exceptions and error logs from the mark on, minus the ignored', () => {
    const events = [
        { method: 'Runtime.consoleAPICalled', params: { type: 'error', args: [{ value: 'old' }] } },
        { method: 'Runtime.consoleAPICalled', params: { type: 'log', args: [{ value: 'fine' }] } },
        { method: 'Runtime.consoleAPICalled', params: { type: 'error', args: [{ value: 'boom' }] } },
        { method: 'Runtime.exceptionThrown', params: { exceptionDetails: { text: 'Uncaught', exception: { description: 'Error: bad' } } } },
        { method: 'Log.entryAdded', params: { entry: { level: 'error', text: 'Failed to load resource', url: 'http://x/favicon.ico' } } },
        { method: 'Log.entryAdded', params: { entry: { level: 'warning', text: 'meh' } } },
    ];
    assert.equal(errorsIn(events).length, 4);
    assert.deepEqual(errorsIn(events, 1, [/favicon/]), ['console.error: boom', 'exception: Error: bad']);
});

test('the cases are named once and every case and shot is a function', () => {
    const names = CASES.map(c => c.name);
    assert.equal(new Set(names).size, names.length);
    for (const c of CASES) assert.equal(typeof c.run, 'function', c.name);
    for (const s of SHOT_PLAN) assert.equal(typeof s, 'function');
});
