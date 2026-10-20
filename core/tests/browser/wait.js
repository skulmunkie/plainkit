// The one polling wait the browser cases share (#1247). A case waits on a STATE ("the first page is drawn", "the Run button exists"), never on a fixed delay, and a
// wait that gives up must give up because the state really did not arrive, not because the machine was busy: the ceiling is a nominal time (tries x every, what an
// idle machine needs with room to spare) stretched by cpuScale() (cpu-scale.js, 1 on an idle machine, at most 4). Cold ES-module graphs, iframes and lazy chunks
// load 2-4x slower under CPU load, and a count of ticks with a short interval was the ceiling that used to trip.
import { cpuScale } from './cpu-scale.js';

export const wait = ms => new Promise(r => setTimeout(r, ms));

let scale = 1, measuredAt = -Infinity;
const loadScale = () => { if (performance.now() - measuredAt > 5000) { scale = cpuScale(); measuredAt = performance.now(); } return scale; };

/** Polls `fn` every `every` ms until it returns something truthy (returned); throws "timed out waiting for <what>" after tries x every ms x the CPU scale. */
export async function until(fn, what, { every = 30, tries = 100 } = {}) {
    const deadline = performance.now() + every * tries * loadScale();
    for (;;) {
        const v = fn();
        if (v) return v;
        if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
        await wait(every);
    }
}

/** Resolves once `el` has no running animation or transition (itself, its shadow tree, its descendants) and its box has not moved for two polls: the state a measuring case needs after something opens (#1565). */
export async function still(el, what, { every = 30, tries = 100 } = {}) {
    let last = '';
    return until(() => {
        const r = el.getBoundingClientRect(), box = `${r.left}|${r.top}|${r.width}|${r.height}`;
        const running = [el, ...el.querySelectorAll('*'), ...(el.shadowRoot ? el.shadowRoot.querySelectorAll('*') : [])].some(e => e.getAnimations().some(a => a.playState === 'running' || a.pending));
        const stable = box === last; last = box;
        return stable && !running;
    }, `${what} to stop moving`, { every, tries });
}