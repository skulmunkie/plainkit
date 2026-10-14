// plainkit.blazor.js setCallback: the AbortSignal an element passes (load(query, { signal })) reaches the .NET host as Cancel(callId). The .NET side is blazor/tests.
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { setCallback } = await import(pathToFileURL(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot', 'plainkit.blazor.js')).href);

const fakeHost = () => {
    const calls = [], pending = [];
    return { calls, pending, invokeMethodAsync: (method, ...args) => { calls.push([method, ...args]); return method === 'Invoke' ? new Promise(r => pending.push(r)) : Promise.resolve(); } };
};

test('a call without a signal invokes the host with call id 0 (JS interop ignores C# defaults, #1329)', async () => {
    const host = fakeHost(), el = {};
    setCallback(el, 'run', host, false);
    const done = el.run({ a: 1 });
    host.pending[0]('ok');
    assert.equal(await done, 'ok');
    assert.deepEqual(host.calls, [['Invoke', { a: 1 }, 0]]);
});

test('aborting the signal calls Cancel with the id the call was sent with', async () => {
    const host = fakeHost(), el = {}, control = new AbortController();
    setCallback(el, 'load', host, false);
    const done = el.load({ page: 1 }, { signal: control.signal });
    const [, , id] = host.calls[0];
    assert.equal(typeof id, 'number');
    control.abort();
    assert.deepEqual(host.calls[1], ['Cancel', id]);
    host.pending[0]('late');
    await done;
});

test('each call gets its own id, and a finished call no longer listens to its signal', async () => {
    const host = fakeHost(), el = {}, a = new AbortController(), b = new AbortController();
    setCallback(el, 'load', host, false);
    const first = el.load({}, { signal: a.signal }), second = el.load({}, { signal: b.signal });
    assert.notEqual(host.calls[0][2], host.calls[1][2]);
    host.pending[0]('x');
    await first;
    a.abort();
    assert.equal(host.calls.filter(c => c[0] === 'Cancel').length, 0, 'a settled call is not cancelled');
    host.pending[1]('y');
    await second;
});

test('every invokeMethodAsync call passes exactly the arguments the C# [JSInvokable] method declares (#1329)', async () => {
    const fs = await import('node:fs');
    const cs = fs.readFileSync(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'PkCallbackSlot.cs'), 'utf8');
    const arity = {};
    for (const m of cs.matchAll(/\[JSInvokable\]\s+public\s+(?:async\s+)?[\w<>?]+\s+(\w+)\(([^)]*)\)/g)) arity[m[1]] = m[2].trim() ? m[2].split(',').length : 0;
    assert.deepEqual(arity, { Invoke: 2, Cancel: 1 });
    const host = fakeHost(), el = {}, control = new AbortController();
    setCallback(el, 'load', host, false);
    const plain = el.load({}), aborted = el.load({}, { signal: control.signal });
    control.abort();
    host.pending.forEach(r => r());
    await Promise.all([plain, aborted]);
    for (const [method, ...args] of host.calls) assert.equal(args.length, arity[method], method + ' called with ' + args.length + ' argument(s)');
});
