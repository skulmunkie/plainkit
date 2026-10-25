// plainkit.reconnect.js (#1714 phase 2): what the banner shows for each view the reconnect policy produces. The painting is DOM work covered by the Blazor browser harness; this is the pure part.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULTS } from '../../core/js/reconnect.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { describe } = await import(pathToFileURL(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot', 'plainkit.reconnect.js')).href); // no document here: importing must not start anything
const s = DEFAULTS.strings;

test('a busy view shows the spinner, Reload, and the attempt after the first', () => {
    assert.deepEqual(describe({ kind: 'busy', text: s.busy, attempt: 1 }, s).show, { spinner: true, tryNow: false, reload: true, cancel: false, resume: false }); // #1771: Reload while retrying
    assert.equal(describe({ kind: 'busy', text: s.busy, attempt: 3 }, s).detail, 'Attempt 3');
    assert.equal(describe({ kind: 'busy', text: s.busy, attempt: 1 }, s).detail, '');
    assert.equal(describe({ kind: 'busy', text: s.busy }, s).tone, 'info');
});

test('failed offers retry and reload, and says when the probe gave up', () => {
    const d = describe({ kind: 'failed', text: s.failed }, s);
    assert.deepEqual(d.show, { spinner: false, tryNow: true, reload: true, cancel: false, resume: false }); assert.equal(d.tone, 'warning');
    assert.equal(describe({ kind: 'failed', text: s.failed, gaveUp: true }, s).detail, 'Still trying');
});

test('ended shows the countdown with Cancel; with no countdown only Reload', () => {
    const d = describe({ kind: 'ended', text: s.ended, countdown: 3 }, s);
    assert.equal(d.detail, 'Reloading in 3 s'); assert.deepEqual(d.show, { spinner: false, tryNow: false, reload: true, cancel: true, resume: false });
    assert.equal(describe({ kind: 'ended', text: s.ended, countdown: null }, s).show.cancel, false);
});

test('paused offers resume; no view shows nothing', () => {
    assert.equal(describe({ kind: 'paused', text: s.paused }, s).show.resume, true);
    const none = describe(null, s); assert.equal(none.kind, null); assert.equal(none.detail, ''); assert.ok(Object.values(none.show).every(v => v === false));
});

test('translated strings fill the placeholders', () => {
    assert.equal(describe({ kind: 'ended', countdown: 4 }, { ...s, reloadIn: 'Neuladen in {0} s' }).detail, 'Neuladen in 4 s');
});
