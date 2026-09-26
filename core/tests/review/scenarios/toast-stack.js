// pk-toast-stack: five toasts queued at the bottom end (three show, two wait), one long message at the top start. The stack is a fixed layer that must stay inside the
// viewport with its gutter (the full width on a phone), the toasts must not overlap each other or the other stack, a long message wraps inside its toast, the
// dismiss button is reachable, and dismissing one lets the next queued toast in.
const ids = [1, 2, 3, 4, 5];
const TOASTS = ids.map(i => `<pk-toast id="n${i}" kind="${['info', 'success', 'warning', 'danger', 'info'][i - 1]}" duration="0"${i === 1 ? ' heading="Import finished"' : ''}>Message number ${i}: the catalogue import wrote 1,204 rows.${i === 2 ? '<pk-button slot="action" variant="ghost" size="mini">Undo</pk-button>' : ''}</pk-toast>`).join('');
const LONG = 'A very long unbroken reference AC-1042-SHIPMENT-CONFIRMATION-0000000000000000000000000000000000000001 could not be matched to any order, so the update was skipped for the whole batch and nothing was written.';

export default {
    name: 'toast-stack',
    elements: ['toast-stack', 'toast'],
    html: `<div class="u-p-1r-1p25r"><p>Page content behind the toasts.</p></div>
<pk-toast-stack id="bottom" position="bottom-end">${TOASTS}</pk-toast-stack>
<pk-toast-stack id="top" position="top-start"><pk-toast id="long" kind="danger" duration="0" heading="Sync failed">${LONG}</pk-toast></pk-toast-stack>`,
    steps: [
        { shot: 'stacked' },
        { click: '#n1 >>> [part=close]' }, { wait: 400 }, { shot: 'dismissed' },
    ],
    expect(t) {
        const visibleIds = ids.filter(i => t.shown(`#n${i}`));
        const first = t.shot === 'stacked' ? [1, 2, 3] : [2, 3, 4];
        t.ok(visibleIds.join() === first.join(), `visible toasts are ${visibleIds.join(', ') || 'none'}, expected ${first.join(', ')} (the stack shows three and queues the rest)`);
        for (const i of visibleIds) { t.inViewport(`#n${i}`); t.within(`#n${i}`, '#bottom', 1); }
        for (let k = 1; k < visibleIds.length; k++) t.noOverlap(`#n${visibleIds[k - 1]}`, `#n${visibleIds[k]}`);
        t.inViewport('#long'); t.within('#long', '#top', 1);
        t.noOverlap('#long', `#n${visibleIds[0]}`);
        const v = t.viewport;
        const l = t.rect('#long'), n = t.rect(`#n${visibleIds[0]}`);
        if (v.name === 'phone') {
            for (const r of [l, n]) if (r) t.ok(r.x >= 8 && r.right <= v.width - 8, `on a phone a toast (x ${Math.round(r.x)} to ${Math.round(r.right)}) has less than an 8px gutter in the ${v.width}px viewport`);
        } else {
            if (l) t.ok(l.x >= 8 && l.width <= 500, `the top-start toast is ${Math.round(l.width)}px wide at x=${Math.round(l.x)}, expected a column of at most 500px at the start`);
            if (n) t.ok(n.right <= v.width - 8 && n.bottom <= v.height - 8, 'the bottom-end toast does not keep its 8px gutter from the corner');
        }
        // The long message wraps inside its toast: nothing runs out of it.
        t.ok(t.metric('#long', 'scrollWidth') <= t.metric('#long', 'clientWidth') + 1, 'the long message runs out of its toast');
        t.within('#long >>> [part=message]', '#long', 1);
        t.within('#long >>> [part=close]', '#long', 1);
        t.atLeast('#long >>> [part=close]', 'height', v.name === 'phone' ? 32 : 24);
        t.visible('#n2 > pk-button', 'the Undo action'); t.within('#n2 > pk-button', '#n2', 1);
        if (t.shot === 'stacked') t.hidden('#n4', 'the fourth toast (queued)');
    },
};
