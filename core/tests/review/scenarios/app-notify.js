// ctx.notify (issue 373): one notification of each kind stacking in the shell's bottom-end pk-toast-stack (the same stack the task manager uses), then the
// same warning raised again, which must not stack twice. Measured on every shot: each toast inside the viewport and the stack, at the bottom end with its gutter,
// no two toasts overlapping, the kind of each, the heading and message contrast against the toast, and the count after the duplicate.
import { createNotify } from '../../../js/notify.js';
import { loadElements } from '../../../js/loader.js';
import { contrast } from '../../../js/colour.js';

const T = h => `pk-toast[heading="${h}"]`;
const ALL = [['Import started', 'info'], ['Order 1042 saved', 'success'], ['Low stock on 3 products', 'warning'], ['Sync failed', 'danger']];

export default {
    name: 'app-notify',
    issue: 373,
    elements: ['toast-stack', 'toast'],
    html: `<div class="rv-page"><pk-cluster><pk-button id="info" size="small">Info</pk-button><pk-button id="success" size="small">Success</pk-button><pk-button id="warn" size="small">Warn</pk-button><pk-button id="error" size="small">Error</pk-button></pk-cluster>
<p>Page content behind the notifications: orders, invoices and photos.</p></div>
<pk-toast-stack id="stack" position="bottom-end" max="4"></pk-toast-stack>`,
    setup(frame) {
        const notify = createNotify({ container: frame, load: el => loadElements(el) });
        const on = (id, fn) => frame.querySelector(`#${id}`).addEventListener('click', fn);
        on('info', () => notify.info('Import started', 'Reading 4,200 rows from orders.csv'));
        on('success', () => notify.success('Order 1042 saved'));
        on('warn', () => notify.warn('Low stock on 3 products', 'Widget cover A, B and C have fewer than 5 left.'));
        on('error', () => notify.error('Sync failed', 'The server did not answer. Your changes are kept on this device.'));
    },
    steps: [
        { click: '#info' }, { click: '#success' }, { click: '#warn' }, { click: '#error' }, { wait: 500 }, { shot: 'four-kinds' },
        { click: '#warn' }, { wait: 300 }, { shot: 'deduped' },
    ],
    expect(t) {
        const v = t.viewport;
        for (const [h, kind] of ALL) {
            const s = T(h);
            t.visible(s, `the notification "${h}"`);
            t.inViewport(s); t.within(s, '#stack', 1);
            t.ok(t.attr(s, 'kind') === kind, `"${h}" is kind ${t.attr(s, 'kind')}, expected ${kind}`);
            const r = t.rect(s);
            if (r) {
                t.ok(r.right <= v.width - 8 + 1 && r.bottom <= v.height - 8 + 1, `"${h}" does not keep its 8px gutter from the bottom-end corner`);
                if (v.name === 'desktop') t.ok(r.x > v.width / 2, `"${h}" is not at the end (x ${Math.round(r.x)} of ${v.width})`);
                else t.ok(r.width >= v.width - 40, `on a phone "${h}" spans ${Math.round(r.width)}px of ${v.width}px`);
            }
            const bg = t.style(s, 'background-color');
            for (const [sel, what] of [[`${s} >>> [part=title]`, 'heading'], [`${s} >>> [part=message]`, 'message']]) {
                if (t.shown(sel)) { const c = contrast(t.style(sel, 'color'), bg); t.ok(c !== null && c >= 4.5, `the ${what} of "${h}" has contrast ${c === null ? 'unreadable' : c.toFixed(2)}, WCAG AA needs 4.5`); }
            }
        }
        for (let i = 1; i < ALL.length; i++) t.noOverlap(T(ALL[i - 1][0]), T(ALL[i][0]), 0.5);
        t.visible(`${T('Sync failed')} >>> [part=close]`, 'the close button of the sticky error');
        t.exists('#stack > pk-toast:nth-of-type(4)'); t.absent('#stack > pk-toast:nth-of-type(5)'); // after the repeated warning too: it is not stacked twice
    },
};
