// Browser cases for the audit dashboard's Screenshots panel (#1708). Same contract as cases.js: [name, async (t) => void]. The module is mounted with a
// fixture manifest passed as an object and the screenshots served from tests/review/fixtures/ (one small PNG that stands for every shot, so no server route is needed).
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

const FIXTURE_BASE = new URL('../review/fixtures/', import.meta.url).pathname;
const shot = (tag, example, viewport, theme, findings = [], extra = {}) => ({ tag, example, title: 't', viewport, theme, width: viewport === 'phone' ? 375 : 1280, file: 'shot.png', boxes: 0, findings, ...extra });
export const SCREENS_MANIFEST = {
    generated: '2026-10-20T08:30:00.000Z',
    summary: { errors: 1, warnings: 1, ok: false },
    shots: [
        ...['desktop', 'phone'].flatMap(v => ['light', 'dark'].map(th => shot('pk-card', 1, v, th, v === 'phone' && th === 'dark' ? [{ rule: 'overflow', severity: 'error', message: 'text overflows its box', fix: 'allow the text to wrap' }] : []))),
        shot('pk-tabs', 2, 'desktop', 'light', [{ rule: 'contrast', severity: 'warning', message: 'low contrast 3.9:1', fix: 'use a stronger token' }]),
        shot('pk-dock', 'rest', 'desktop', 'light', [], { scenario: 'dock-open' }),
    ],
    findings: [],
};

export async function mountScreens(t, width, reviewUrl = SCREENS_MANIFEST, screensBase = FIXTURE_BASE) {
    const { mountAuditDashboard } = await import('../../modules/audit-dashboard/audit-dashboard.js');
    const host = t.stage('<div></div>').firstElementChild;
    host.style.width = `${width}px`;
    await mountAuditDashboard(host, { baselineUrl: { version: 1, entries: [] }, reviewUrl, screensBase, height: '36rem' });
    const panel = await until(() => host.querySelector('[slot=screens]'), 'the Screenshots panel');
    await t.settle(); await wait(300);
    const tab = await until(() => [...host.querySelector('pk-dock').shadowRoot.querySelectorAll('pk-tab')].find(x => /Screenshots/.test(x.textContent)), 'the Screenshots tab');
    tab.click(); await t.settle(); await wait(250);
    return { host, panel };
}

const rect = el => el.getBoundingClientRect();
const tiles = panel => [...panel.querySelector('pk-image-gallery').shadowRoot.querySelectorAll('[data-index]')];
const pick = async (select, value) => { select.value = value; select.dispatchEvent(new CustomEvent('pk-value-change', { detail: { value, values: [value] }, bubbles: true })); await wait(200); };

export const auditScreensCases = [
    ...[1280, 375].map(width => [`audit dashboard screenshots (${width}px): thumbnails load, filters narrow them, findings show with the FIX text, all inside the width (#1708)`, async t => {
        const { host, panel } = await mountScreens(t, width);
        const gallery = panel.querySelector('pk-image-gallery');
        await until(() => tiles(panel).length === 6, 'six thumbnails');
        const img = tiles(panel)[0].querySelector('img');
        t.ok(img.getAttribute('src').endsWith('/tests/review/fixtures/shot.png'), `the thumbnail points at the screenshot route (${img.getAttribute('src')})`);
        t.ok((await fetch(img.getAttribute('src'))).ok, 'and that file is served');
        t.ok(rect(gallery).right <= rect(host).right + 1 && rect(gallery).width > 0, `the gallery stays inside the ${width}px host`);
        t.ok(host.scrollWidth <= host.clientWidth + 1, `the host does not scroll sideways (${host.scrollWidth} of ${host.clientWidth})`);
        const [item, viewport, theme] = panel.querySelectorAll('pk-select');
        await pick(item, 'pk-card');
        t.eq(tiles(panel).length, 4, 'the element filter shows its four variants (desktop and phone, light and dark) side by side');
        await pick(viewport, 'phone');
        t.eq(tiles(panel).length, 2, 'the viewport filter narrows to phone');
        await pick(theme, 'dark');
        t.eq(tiles(panel).length, 1, 'the theme filter narrows to one');
        const table = panel.querySelector('pk-table');
        t.ok(!table.hidden && /FIX: allow the text to wrap/.test(table.getAttribute('rows')), 'the finding of that shot is listed with its FIX text');
        await pick(item, ''); await pick(viewport, ''); await pick(theme, '');
        panel.querySelector('pk-checkbox').dispatchEvent(new CustomEvent('pk-change', { detail: { checked: true }, bubbles: true })); await wait(200);
        t.eq(tiles(panel).length, 2, 'only shots with findings: the error and the warning');
        t.ok(panel.querySelector('[role=status]').textContent.includes('2 of 6'), 'the status line counts shown and all');
    }]),
    ['audit dashboard screenshots: a thumbnail opens the enlarged view and every thumbnail has a name (#1708)', async t => {
        const { panel } = await mountScreens(t, 1280);
        const gallery = panel.querySelector('pk-image-gallery');
        await until(() => tiles(panel).length === 6, 'six thumbnails');
        t.ok(tiles(panel).every(li => li.querySelector('img').alt.length > 0), 'every thumbnail has alt text naming element, viewport and theme');
        await gallery.view(0); await wait(300);
        const viewer = gallery.shadowRoot.querySelector('pk-lightbox');
        t.ok(viewer && viewer.hasAttribute('open'), 'the lightbox is open on the chosen shot');
    }],
    ['audit dashboard screenshots: where the review route does not exist the panel shows an empty state naming the commands, with no error (#1708)', async t => {
        const errors = [];
        const original = console.error; console.error = (...a) => { errors.push(a.join(' ')); original.apply(console, a); };
        try {
            const { panel } = await mountScreens(t, 1280, '/_audit/definitely-not-there.json');
            const empty = panel.querySelector('pk-empty-state:not([slot])');
            t.ok(!empty.hidden, 'the empty state is shown');
            t.ok(/ui-review\.mjs/.test(empty.getAttribute('description')) && /serve\.mjs/.test(empty.getAttribute('description')), `it names both commands (${empty.getAttribute('description')})`);
            t.ok(panel.querySelector('pk-image-gallery').closest('pk-stack').hidden, 'no gallery is drawn');
            t.eq(errors.length, 0, `nothing is logged as an error (${errors.join(' | ')})`);
        } finally { console.error = original; }
    }],
];
