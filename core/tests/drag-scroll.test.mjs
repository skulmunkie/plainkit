// js/drag-scroll.js: the pure edge rule and the frame loop (the DOM half is measured in the browser suite, cases-layout.js "drag auto-scroll").
import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeSpeed, frameLoop } from '../js/drag-scroll.js';

test('edgeSpeed: zero mid-way, signed and proportional near an edge, steady half speed when reduced', () => {
    assert.equal(edgeSpeed(500, 0, 1000), 0);
    assert.equal(edgeSpeed(0, 0, 1000), -18);
    assert.equal(edgeSpeed(1000, 0, 1000), 18);
    assert.equal(edgeSpeed(32, 0, 1000), -9);
    assert.equal(edgeSpeed(63, 0, 1000, true), -9);
    assert.equal(edgeSpeed(5, 0, 0), 0);
});

test('frameLoop: steps every frame, start twice runs one loop, stop leaves no callback pending', () => {
    const q = new Map(); let n = 0, steps = 0;
    globalThis.requestAnimationFrame = fn => { q.set(++n, fn); return n; };
    globalThis.cancelAnimationFrame = id => q.delete(id);
    const loop = frameLoop(() => { steps++; });
    loop.start(); loop.start();
    assert.equal(q.size, 1);
    const run = () => { const f = [...q]; q.clear(); f.forEach(([, fn]) => fn()); };
    run(); run();
    assert.equal(steps, 2); assert.equal(q.size, 1);
    loop.stop();
    assert.equal(q.size, 0);
    run();
    assert.equal(steps, 2);
});
