// ctx.dialogs (issue 373): a destructive confirm and a prompt, built by the dialog factory over pk-dialog. Steps: the confirm opens with focus on the safe Cancel,
// Tab three times stays inside it (the focus trap), Escape cancels it and focus goes back to the button that opened it; the prompt opens with focus in its field,
// typing and Enter resolve it with the text. Measured: the dialog centred on a desktop and full screen on a phone, its buttons inside it, the heading and message
// shown, where focus is (a probe records document.activeElement on every focusin) and what each promise resolved to.
import { createDialogs } from '../../../js/dialogs.js';
import { loadElements } from '../../../js/loader.js';

const D = 'pk-dialog >>> [part=dialog]';

export default {
    name: 'app-dialogs',
    issue: 373,
    elements: ['dialog', 'field', 'input'],
    html: `<div class="rv-page"><pk-cluster><pk-button id="delete" size="small" variant="warn">Delete order</pk-button><pk-button id="rename" size="small">Rename list</pk-button></pk-cluster>
<p>Page content behind the dialog: orders, invoices and photos.</p>
<p id="probe" data-focus="" data-result="">Result: none yet</p></div>`,
    setup(frame) {
        const dialogs = createDialogs({ container: frame, load: el => loadElements(el) });
        const probe = frame.querySelector('#probe');
        const where = () => { const a = frame.ownerDocument.activeElement; return a ? `${a.closest?.('pk-dialog') ? 'dialog:' : 'page:'}${a.id || a.localName}:${(a.textContent ?? '').trim().slice(0, 20)}` : 'none'; };
        frame.ownerDocument.addEventListener('focusin', () => probe.setAttribute('data-focus', where()));
        const done = r => { probe.setAttribute('data-result', JSON.stringify(r) ?? 'undefined'); probe.textContent = `Result: ${JSON.stringify(r)}`; probe.setAttribute('data-focus', where()); };
        frame.querySelector('#delete').addEventListener('click', () => dialogs.confirm({ heading: 'Delete order 1042?', message: 'The order and its 3 invoices are removed. This cannot be undone.', confirmLabel: 'Delete', danger: true }).then(done));
        frame.querySelector('#rename').addEventListener('click', () => dialogs.prompt({ heading: 'Rename the list', message: 'Customers see this name on the storefront.', label: 'List name', value: '', required: true, maxLength: 80 }).then(done));
    },
    steps: [
        { click: '#delete' }, { wait: 500 }, { shot: 'confirm' },
        { key: 'Tab', times: 3 }, { wait: 100 }, { shot: 'confirm-trapped' },
        { key: 'Escape' }, { wait: 400 }, { shot: 'confirm-cancelled' },
        { click: '#rename' }, { wait: 500 }, { shot: 'prompt' },
        { type: 'Spring sale' }, { key: 'Enter' }, { wait: 400 }, { shot: 'prompt-done' },
    ],
    expect(t) {
        const v = t.viewport, focus = t.attr('#probe', 'data-focus') ?? '', result = t.attr('#probe', 'data-result');
        const open = ['confirm', 'confirm-trapped', 'prompt'].includes(t.shot);
        if (!open) {
            t.absent('pk-dialog');
            t.ok(focus.startsWith('page:delete') || focus.startsWith('page:rename'), `after close focus is on "${focus}", expected the button that opened the dialog`);
            if (t.shot === 'confirm-cancelled') t.ok(result === 'false', `Escape resolved the confirm with ${result}, expected false`);
            if (t.shot === 'prompt-done') t.ok(result === '"Spring sale"', `the prompt resolved with ${result}, expected "Spring sale"`);
            return;
        }
        t.visible(D, 'the open dialog'); t.inViewport(D);
        t.within('pk-dialog > pk-button', D, 1);
        t.ok(focus.startsWith('dialog:'), `focus is on "${focus}", expected inside the open dialog (the trap)`);
        if (t.shot === 'confirm') t.ok(focus.includes('Cancel'), `a destructive confirm focuses "${focus}", expected Cancel`);
        if (t.shot === 'prompt') { t.visible('pk-dialog pk-field', 'the field'); t.within('pk-dialog pk-field', D, 1); t.ok(focus.includes('pk-input'), `the prompt focuses "${focus}", expected its field`); }
        t.hasText('pk-dialog > p', t.shot === 'prompt' ? 'storefront' : 'cannot be undone');
        const d = t.rect(D);
        if (d && v.name === 'desktop') {
            t.ok(Math.abs((d.x + d.width / 2) - v.width / 2) <= 2, `the dialog is centred at x=${Math.round(d.x + d.width / 2)}, expected ${v.width / 2}`);
            t.ok(Math.abs((d.y + d.height / 2) - v.height / 2) <= 2, `the dialog is centred at y=${Math.round(d.y + d.height / 2)}, expected ${v.height / 2}`);
        }
        if (d && v.name === 'phone') t.ok(d.width >= v.width - 1 && d.height >= v.height - 1, `on a phone the dialog is ${Math.round(d.width)}x${Math.round(d.height)}, expected the full screen ${v.width}x${v.height}`);
    },
};
