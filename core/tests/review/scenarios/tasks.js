// The task manager's progress toasts (issue 372): every state of a task shown as one pk-toast in the bottom-end pk-toast-stack, composed from existing elements. Concurrency is 2
// so a third task is queued. Steps: a determinate running task, an indeterminate one, a third queued (a stack of three), the queued one cancelled, the first done, a failure
// with Retry, and the retry succeeding. Measured on every shot: each toast inside the viewport and at the bottom end, no two toasts overlapping, the progress value the task
// pushed, the state label, the kind, the contrast of the heading, details and label against the toast, and that the action button sits inside its toast.
import { createTasks } from '../../../js/tasks.js';
import { loadElements } from '../../../js/loader.js';
import { contrast } from '../../../js/colour.js';

const T = h => `pk-toast[heading="${h}"]`;
const A = 'Import orders', B = 'Rebuild search index', C = 'Export report', D = 'Upload photos';

export default {
    name: 'tasks',
    issue: 372,
    elements: ['toast-stack', 'toast', 'progress'],
    html: `<div class="rv-page"><pk-cluster><pk-button id="a" size="small">Run A</pk-button><pk-button id="b" size="small">Run B</pk-button><pk-button id="c" size="small">Run C</pk-button><pk-button id="cancel-c" size="small">Cancel C</pk-button><pk-button id="finish-a" size="small">Finish A</pk-button><pk-button id="d" size="small">Run D</pk-button></pk-cluster>
<p>Page content behind the toasts: orders, invoices and photos.</p></div>
<pk-toast-stack id="stack" position="bottom-end"></pk-toast-stack>`,
    setup(frame) {
        const tasks = createTasks({ container: frame, concurrency: 2, doneDelay: 600000, load: el => loadElements(el) });
        const gates = {}, handles = {};
        const hold = key => new Promise(r => { gates[key] = r; });
        const on = (id, fn) => frame.querySelector(`#${id}`).addEventListener('click', fn);
        let attempts = 0;
        on('a', () => { handles.a = tasks.run({ title: A, details: 'Reading 4,200 rows', run: async ctx => { ctx.progress(40); await hold('a'); } }); });
        on('b', () => { handles.b = tasks.run({ title: B, details: 'This can take a while', run: () => hold('b') }); });
        on('c', () => { handles.c = tasks.run({ title: C, details: 'Waiting for a free slot in the queue', cancellable: true, run: ctx => new Promise((_, no) => ctx.signal.addEventListener('abort', () => no(new Error('aborted')))) }); });
        on('cancel-c', () => handles.c?.cancel());
        on('finish-a', () => gates.a?.());
        on('d', () => {
            handles.d = tasks.run({ title: D, details: 'Uploading 12 photos', retry: true, run: async ctx => {
                ctx.progress(7, 12);
                if (++attempts === 1) throw Object.assign(new Error('The server rejected photo 8: it is larger than 10 MB.'), { userFacing: true });
                ctx.progress(12, 12);
            } });
        });
    },
    steps: [
        { click: '#a' }, { wait: 500 }, { shot: 'running-determinate' },
        { click: '#b' }, { wait: 300 }, { shot: 'running-indeterminate' },
        { click: '#c' }, { wait: 300 }, { shot: 'stack-of-three' },
        { click: '#cancel-c' }, { wait: 300 }, { shot: 'cancelled' },
        { click: `${T(C)} >>> [part=close]` }, { wait: 200 },
        { click: '#finish-a' }, { wait: 300 }, { shot: 'done' },
        { click: `${T(A)} >>> [part=close]` }, { wait: 200 },
        { click: '#d' }, { wait: 800 }, { shot: 'failed-retry' },
        { click: `${T(D)} > pk-button` }, { wait: 800 }, { shot: 'retried' },
    ],
    expect(t) {
        const v = t.viewport;
        const shownNow = { 'running-determinate': [A], 'running-indeterminate': [A, B], 'stack-of-three': [A, B, C], cancelled: [A, B, C], done: [B, A], 'failed-retry': [B, D], retried: [B, D] }[t.shot];
        for (const h of shownNow) t.visible(T(h), `the toast "${h}"`);
        for (const h of shownNow) {
            const s = T(h);
            t.inViewport(s); t.within(s, '#stack', 1);
            const r = t.rect(s);
            if (r) {
                t.ok(r.right <= v.width - 8 + 1 && r.bottom <= v.height - 8 + 1, `"${h}" does not keep its 8px gutter from the bottom-end corner`);
                if (v.name === 'desktop') t.ok(r.x > v.width / 2 && r.y > v.height / 3, `"${h}" is not at the bottom end (x ${Math.round(r.x)}, y ${Math.round(r.y)} in ${v.width}x${v.height})`);
                else t.ok(r.x >= 8 - 1 && r.width >= v.width - 40, `on a phone "${h}" spans ${Math.round(r.width)}px of ${v.width}px`);
            }
            const bg = t.style(s, 'background-color');
            for (const [sel, what] of [[`${s} >>> [part=title]`, 'heading'], [`${s} > div`, 'details'], [`${s} pk-progress >>> [part=label]`, 'state label']]) {
                if (t.shown(sel)) { const c = contrast(t.style(sel, 'color'), bg); t.ok(c !== null && c >= 4.5, `the ${what} of "${h}" has contrast ${c === null ? 'unreadable' : c.toFixed(2)} on the toast, WCAG AA needs 4.5`); }
            }
            t.visible(`${s} pk-progress >>> [part=bar]`, `the progress bar of "${h}"`);
            t.atLeast(`${s} pk-progress >>> [part=bar]`, 'height', 3);
            t.within(`${s} pk-progress >>> [part=bar]`, s, 1);
        }
        for (let i = 1; i < shownNow.length; i++) t.noOverlap(T(shownNow[i - 1]), T(shownNow[i]), 0.5);
        const label = h => t.text(`${T(h)} pk-progress >>> [part=label]`).trim();
        const kind = h => t.attr(T(h), 'kind');
        const val = h => t.attr(`${T(h)} pk-progress`, 'value');
        if (t.shot === 'running-determinate') {
            t.ok(label(A) === 'Running' && kind(A) === 'info', `A is "${label(A)}", kind ${kind(A)}`);
            t.ok(val(A) === '40' && t.attr(`${T(A)} pk-progress`, 'indeterminate') === null, `A's bar value is ${val(A)}, expected 40 (determinate)`);
            t.hasText(`${T(A)} pk-progress >>> [part=value]`, '40%');
            t.hasText(`${T(A)} > div`, 'Reading 4,200 rows');
            t.hidden(`${T(A)} >>> [part=close]`, 'the close button of a running task');
        }
        if (t.shot === 'running-indeterminate') t.ok(t.attr(`${T(B)} pk-progress`, 'indeterminate') !== null && label(B) === 'Running', `B is not an indeterminate running bar (${label(B)})`);
        if (t.shot === 'stack-of-three') {
            t.ok(label(C) === 'Queued' && (val(C) ?? '0') === '0', `C is "${label(C)}" with value ${val(C)}, expected Queued at 0`);
            t.hasText(`${T(C)} > div`, 'Waiting for a free slot');
            t.visible(`${T(C)} > pk-button`, 'the Cancel button of the queued task'); t.within(`${T(C)} > pk-button`, T(C), 1);
            t.ok(t.text(`${T(C)} > pk-button`).trim() === 'Cancel', 'the queued toast offers Cancel');
            t.ok(val(A) === '40', 'A keeps its value');
        }
        if (t.shot === 'cancelled') {
            t.ok(kind(C) === 'warning' && label(C) === 'Cancelled', `C is "${label(C)}", kind ${kind(C)}`);
            t.hidden(`${T(C)} > div`, 'the details line (the label says Cancelled)'); t.absent(`${T(C)} > pk-button`);
            t.visible(`${T(C)} >>> [part=close]`, 'the close button of a finished task');
            t.ok(label(B) === 'Running', 'B keeps running');
        }
        if (t.shot === 'done') {
            t.ok(kind(A) === 'success' && label(A) === 'Done' && val(A) === '100', `A is "${label(A)}", kind ${kind(A)}, value ${val(A)}, expected Done, success, 100`);
            t.ok(label(B) === 'Running', 'B still runs');
        }
        if (t.shot === 'failed-retry') {
            t.ok(kind(D) === 'danger' && label(D) === 'Failed', `D is "${label(D)}", kind ${kind(D)}`);
            t.hasText(`${T(D)} > div`, 'larger than 10 MB');
            t.ok(t.text(`${T(D)} > pk-button`).trim() === 'Retry', 'the failed toast offers Retry'); t.within(`${T(D)} > pk-button`, T(D), 1);
            t.ok(val(D) === '7' && t.attr(`${T(D)} pk-progress`, 'max') === '12', `D's bar stops where it failed (value ${val(D)} of ${t.attr(`${T(D)} pk-progress`, 'max')})`);
        }
        if (t.shot === 'retried') {
            t.ok(kind(D) === 'success' && val(D) === '12', `the retry ended ${kind(D)} at ${val(D)}, expected success at 12`);
        }
    },
};
