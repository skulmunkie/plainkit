// The pure parts of scripts/attest-browser.mjs: finding a browser, its flags, reading a report, the command line. The run itself needs a browser and
// takes minutes, so it is not tested here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeCandidates, findChrome, chromeArgs, summarizeReport, isNewRun, parseArgs, MIN_WIDTH } from '../attest-browser.mjs';

test('PK_CHROME comes first, then the platform install paths', () => {
    const win = chromeCandidates({ env: { PK_CHROME: 'X:\\chrome.exe', PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, platform: 'win32' });
    assert.equal(win[0], 'X:\\chrome.exe');
    assert.ok(win.includes('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'));
    assert.ok(win.includes('C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'));
    assert.ok(win.every(p => !p.includes('undefined')), 'an unset variable never leaks into a path');
    const linux = chromeCandidates({ env: {}, platform: 'linux', pathDirs: ['/opt/bin'] });
    assert.ok(linux.includes('/opt/bin/google-chrome') && linux.includes('/usr/bin/chromium'));
    assert.ok(chromeCandidates({ env: {}, platform: 'darwin' })[0].endsWith('Google Chrome'));
});

test('findChrome returns the first path that exists, null when none does, and refuses a PK_CHROME that is missing', () => {
    const only = new Set(['/usr/bin/chromium']);
    assert.equal(findChrome({ env: {}, platform: 'linux' }, p => only.has(p)), '/usr/bin/chromium');
    assert.equal(findChrome({ env: {}, platform: 'linux' }, () => false), null);
    assert.throws(() => findChrome({ env: { PK_CHROME: '/nope' }, platform: 'linux' }, () => false), /PK_CHROME/);
    assert.equal(findChrome({ env: { PK_CHROME: '/mine' }, platform: 'linux' }, p => p === '/mine'), '/mine');
});

test('chromeArgs are the flags that work on this repository, with a desktop-sized window', () => {
    const args = chromeArgs({ profile: '/tmp/p', url: 'http://localhost:5341/tests/browser/', extra: '--no-sandbox  --foo' });
    assert.deepEqual(args, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=/tmp/p', '--window-size=1280,900', '--no-sandbox', '--foo', 'http://localhost:5341/tests/browser/']);
});

test('summarizeReport counts the run and is strict about what a good report is', () => {
    const good = { ran: 't1', passed: 2, failed: 0, results: [{ ok: true }, { ok: true }] };
    assert.deepEqual(summarizeReport(good), { passed: 2, failed: 0, total: 2, ran: 't1', ok: true });
    assert.equal(summarizeReport({ ...good, failed: 1, passed: 1, results: [{ ok: true }, { ok: false }] }).ok, false);
    assert.equal(summarizeReport({ ...good, results: [{ ok: true }] }).ok, false, 'counts that disagree with the results are not ok');
    assert.equal(summarizeReport({ ran: 't', passed: 0, failed: 0, results: [] }).ok, false, 'an empty run is not a pass');
    assert.equal(summarizeReport(null), null);
    assert.equal(summarizeReport({ passed: 1 }), null);
});

test('isNewRun tells the report of this run from the one that was there before', () => {
    assert.equal(isNewRun('t1', { ran: 't2' }), true);
    assert.equal(isNewRun('t1', { ran: 't1' }), false);
    assert.equal(isNewRun(null, { ran: 't1' }), true);
    assert.equal(isNewRun('t1', null), false);
    assert.equal(isNewRun('t1', {}), false);
});

test('parseArgs has desktop defaults, takes numbers, and refuses a small window or an unknown flag', () => {
    assert.deepEqual(parseArgs([]), { port: 5341, timeout: 420, width: 1280, height: 900, filter: [], elements: [] });
    assert.deepEqual(parseArgs(['--port', '5400', '--timeout', '60']), { port: 5400, timeout: 60, width: 1280, height: 900, filter: [], elements: [] });
    assert.throws(() => parseArgs(['--width', '486', '--height', '425']), /at least/);
    assert.throws(() => parseArgs(['--width', String(MIN_WIDTH - 1)]), /at least/);
    assert.throws(() => parseArgs(['--port', 'abc']), /positive whole number/);
    assert.throws(() => parseArgs(['--port']), /positive whole number/);
    assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('--filter and --elements narrow the run; a missing value is an error', async () => {
    const { selectionNote } = await import('../attest-browser.mjs');
    const o = parseArgs(['--filter', 'Tabs, focus', '--elements', 'pk-button,card']);
    assert.deepEqual(o.filter, ['tabs', 'focus']);
    assert.deepEqual(o.elements, ['pk-button', 'card']);
    assert.deepEqual(parseArgs([]).filter, []);
    assert.throws(() => parseArgs(['--filter']), /needs a value/);
    assert.throws(() => parseArgs(['--elements', '--port']), /needs a value/);
    assert.equal(selectionNote({ passed: 1 }), '');
    assert.match(selectionNote({ selected: 3, totalCases: 426, filter: { filter: ['x'], elements: ['button'] } }), /3 of 426 cases selected \(filter x, element button\)/);
});

test('case-filter keeps cases by substring or by whole-word element name', async () => {
    const { selectCases, namesElement, parseList } = await import('../../core/tests/browser/case-filter.js');
    const cases = [['button: defaults', 1], ['data-table: sorts', 2], ['the pk-button focus ring', 3], ['tabs: arrow keys', 4], ['buttons are many', 5]];
    assert.equal(selectCases(cases).length, 5);
    assert.deepEqual(selectCases(cases, { elements: ['button'] }).map(c => c[1]), [1, 3]);
    assert.deepEqual(selectCases(cases, { elements: ['table'] }), [], 'data-table does not name table');
    assert.deepEqual(selectCases(cases, { elements: ['data-table'] }).map(c => c[1]), [2]);
    assert.deepEqual(selectCases(cases, { filter: ['arrow'] }).map(c => c[1]), [4]);
    assert.deepEqual(selectCases(cases, { filter: ['nope'], elements: ['nothing'] }), [], 'a filter that matches nothing selects nothing');
    assert.equal(namesElement('pk-tabs: x', 'pk-tabs'), true);
    assert.deepEqual(parseList(' A, ,b '), ['a', 'b']);
});
