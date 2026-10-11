// The audit dashboard module (modules/audit-dashboard, docs/superpowers/specs/2026-09-30-audit-dashboard-design.md): mounted with a small
// fixture baseline document (passed straight to mountAuditDashboard instead of a URL - loadJson takes an object as-is, so this never calls
// fetch or a dev server) inside a pk-dock workspace (module baseline | Properties), a row selected so the Properties panel fills in.
const FIXTURE = {
    version: 1,
    entries: [
        { rule: 'S1', file: 'core/modules/code-explorer/code-explorer.css', fingerprint: 'a' },
        { rule: 'S3', file: 'core/modules/code-explorer/element.js', fingerprint: 'b' },
        { rule: 'S3', file: 'core/modules/code-explorer/element.js', fingerprint: 'b' },
        { rule: 'S9', file: 'core/modules/code-explorer/code-explorer.css', fingerprint: 'c' },
        { rule: 'S3', file: 'core/modules/logs/logs.js', fingerprint: 'd' },
    ],
};

// The UI-review panel's fixture: the shape scripts/ui-review.mjs writes to review-output/manifest.json.
const REVIEW = {
    generated: '2026-10-11T08:30:00.000Z',
    summary: { errors: 1, warnings: 2, ok: false },
    findings: [
        { rule: 'overflow', severity: 'error', tag: 'pk-card', example: 2, path: 'pk-card > p', message: 'text overflows its box', fix: 'allow the text to wrap', seen: ['phone/light', 'phone/dark'] },
        { rule: 'contrast', severity: 'warning', tag: 'pk-table', example: 1, path: 'pk-table th', message: 'low contrast 3.9:1', fix: 'use a stronger token', seen: ['desktop/dark'] },
        { rule: 'tap-target', severity: 'warning', tag: 'pk-tabs', example: 3, path: 'pk-tabs button', message: 'target is 30px', seen: ['phone/light'] },
    ],
};

export default {
    name: 'audit-dashboard',
    elements: ['dock', 'table', 'input', 'card'],
    html: '<div class="rv-bounded"><div id="mount"></div></div>',
    async setup(frame) {
        // Imported here, not at the top: the scenario module is also loaded in Node, where the module's DOM code must not run.
        const { mountAuditDashboard } = await import('../../../modules/audit-dashboard/audit-dashboard.js');
        const el = frame.querySelector('#mount');
        await mountAuditDashboard(el, { baselineUrl: FIXTURE, reviewUrl: REVIEW, height: 'fill' });
    },
    steps: [
        { wait: 'settle' }, { wait: 500 },
        { shot: 'rest' },
        { click: '#mount pk-table >>> tbody tr:first-child', on: ['desktop'] }, { wait: 150, on: ['desktop'] },
        { shot: 'selected', on: ['desktop'] },
        { click: '#mount pk-dock >>> pk-tab:nth-of-type(2)' }, { wait: 300 },
        { shot: 'review' },
        { click: '#mount [slot=review] pk-table >>> tbody tr:first-child', on: ['desktop'] }, { wait: 150, on: ['desktop'] },
        { shot: 'review-selected', on: ['desktop'] },
    ],
    expect(t) {
        t.exists('#mount pk-dock', 'the dashboard lays out its panels as a pk-dock workspace');
        t.visible('#mount pk-dock >>> [part=group]');
        t.exists('#mount pk-table', 'the module baseline panel shows a findings table');
        t.hasText('#mount pk-table >>> tbody', 'S1');
        t.hasText('#mount pk-table >>> tbody', 'S3');
        if (t.shot === 'review' || t.shot === 'review-selected') {
            t.hasText('[slot=review] pk-table >>> tbody', 'overflow', 'the UI review panel lists the manifest\'s findings');
            if (t.shot === 'review-selected') t.hasText('[slot=properties]', 'FIX: allow the text to wrap', 'a chosen review finding fills the Properties panel with its FIX line');
        } else if (t.shot === 'selected') {
            t.hasText('[slot=properties]', 'Rule: S1', 'the Properties panel fills in with the selected finding\'s detail');
        } else {
            t.hasText('[slot=properties] pk-empty-state >>> [part=heading]', 'Nothing selected', 'the Properties panel starts empty until a finding is chosen');
        }
    },
};
