// Browser cases for the audit dashboard's UI-review panel (#717). Same contract as cases.js: [name, async (t) => void]. The module is mounted into a
// host of a fixed width (1280, then 375) with a fixture manifest passed straight in as an object (loadJson takes an object as-is: no fetch, no dev server).
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

const MANIFEST = {
    generated: '2026-10-11T08:30:00.000Z',
    summary: { errors: 1, warnings: 1, ok: false },
    findings: [
        { rule: 'overflow', severity: 'error', tag: 'pk-card', example: 2, path: 'pk-card > p', message: 'text overflows its box', fix: 'allow the text to wrap', seen: ['phone/light'] },
        { rule: 'contrast', severity: 'warning', tag: 'pk-table', example: 1, path: 'pk-table th', message: 'low contrast 3.9:1', fix: 'use a stronger token', seen: ['desktop/dark'] },
    ],
};

async function mount(t, width, reviewUrl) {
    const { mountAuditDashboard } = await import('../../modules/audit-dashboard/audit-dashboard.js');
    const host = t.stage('<div></div>').firstElementChild;
    host.style.width = `${width}px`;
    await mountAuditDashboard(host, { baselineUrl: { version: 1, entries: [] }, reviewUrl, height: '30rem' });
    const panel = await until(() => host.querySelector('[slot=review]'), 'the UI review panel');
    await t.settle(); await wait(300);
    // The module baseline is the first tab; the review panel is the next one in the same group.
    const tab = await until(() => [...host.querySelector('pk-dock').shadowRoot.querySelectorAll('pk-tab')].find(x => /UI review/.test(x.textContent)), 'the UI review tab');
    tab.click(); await t.settle(); await wait(200);
    return { host, panel };
}

const rect = el => el.getBoundingClientRect();

export const auditDashboardCases = [
    ...[1280, 375].map(width => [`audit dashboard (${width}px): the UI review panel lists the manifest's findings inside the width and a chosen finding fills the Properties panel (#717)`, async t => {
        const { host, panel } = await mount(t, width, MANIFEST);
        const table = panel.querySelector('pk-table');
        await until(() => table.shadowRoot?.querySelector('tbody tr, [part=card]'), 'the review rows');
        const text = table.shadowRoot.textContent;
        t.ok(text.includes('overflow') && text.includes('contrast'), `both findings are listed (${text.slice(0, 80)})`);
        t.ok(rect(table).right <= rect(host).right + 1 && rect(table).width > 0, `the table stays inside the ${width}px host (right ${Math.round(rect(table).right)} of ${Math.round(rect(host).right)})`);
        t.ok(host.scrollWidth <= host.clientWidth + 1, `the host does not scroll sideways (${host.scrollWidth} of ${host.clientWidth})`);
        table.dispatchEvent(new CustomEvent('pk-row-click', { detail: { id: '0' }, bubbles: true }));
        await wait(150);
        t.ok(host.querySelector('[slot=properties]').textContent.includes('FIX: allow the text to wrap'), 'the Properties panel shows the selected finding\'s FIX line');
    }]),
    ...['baseline', 'review'].map(tabName => [`audit dashboard (375px): the ${tabName} tab's header paragraph and status line stay inside the host and the review cards show every column (#1142)`, async t => {
        const { host, panel } = await mount(t, 375, MANIFEST);
        if (tabName === 'baseline') {
            const tab = [...host.querySelector('pk-dock').shadowRoot.querySelectorAll('pk-tab')].find(x => /Module baseline/.test(x.textContent));
            tab.click(); await t.settle(); await wait(200);
        }
        const pane = host.querySelector(`[slot=${tabName}]`);
        const box = rect(host);
        for (const sel of ['.ad-header', '.ad-status']) {
            const el = pane.querySelector(sel); const r = rect(el);
            t.ok(r.width > 0 && r.left >= box.left - 1 && r.right <= box.right + 1, `${sel} of the ${tabName} tab stays inside the host (left ${Math.round(r.left)}, right ${Math.round(r.right)} of ${Math.round(box.left)}..${Math.round(box.right)})`);
            t.ok(el.scrollWidth <= el.clientWidth + 1, `${sel} does not clip its own text (${el.scrollWidth} of ${el.clientWidth})`);
        }
        if (tabName === 'review') {
            const table = panel.querySelector('pk-table');
            await until(() => table.shadowRoot?.querySelector('[part=card], tbody tr'), 'the review rows');
            t.ok(table.shadowRoot.textContent.includes('Seen in'), 'the cards show the Seen in column');
        }
    }]),
    ['audit dashboard: a missing review manifest shows a clear empty state naming the command, not a blank table (#717)', async t => {
        const { panel } = await mount(t, 1280, '/_audit/definitely-not-there.json');
        const empty = panel.querySelector('pk-empty-state');
        t.ok(/ui-review\.mjs/.test(empty.getAttribute('description')), `the empty state names the command (${empty.getAttribute('description')})`);
        t.eq(empty.getAttribute('heading'), 'No UI review found');
        t.ok(panel.querySelector('[role=status]').textContent.includes('No UI review output'), 'the status line says nothing was found');
    }],
];
