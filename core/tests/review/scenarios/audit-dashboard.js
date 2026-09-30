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

export default {
    name: 'audit-dashboard',
    elements: ['dock', 'table', 'input', 'card'],
    html: '<div class="rv-bounded"><div id="mount"></div></div>',
    async setup(frame) {
        // Imported here, not at the top: the scenario module is also loaded in Node, where the module's DOM code must not run.
        const { mountAuditDashboard } = await import('../../../modules/audit-dashboard/audit-dashboard.js');
        const el = frame.querySelector('#mount');
        await mountAuditDashboard(el, { baselineUrl: FIXTURE, height: 'fill' });
    },
    steps: [
        { wait: 'settle' }, { wait: 500 },
        { shot: 'rest' },
        { click: '#mount pk-table >>> tbody tr:first-child', on: ['desktop'] }, { wait: 150, on: ['desktop'] },
        { shot: 'selected', on: ['desktop'] },
    ],
    expect(t) {
        t.exists('#mount pk-dock', 'the dashboard lays out its panels as a pk-dock workspace');
        t.visible('#mount pk-dock >>> [part=group]');
        t.exists('#mount pk-table', 'the module baseline panel shows a findings table');
        t.hasText('#mount pk-table >>> tbody', 'S1');
        t.hasText('#mount pk-table >>> tbody', 'S3');
        if (t.shot === 'selected') {
            t.hasText('[slot=properties]', 'Rule: S1', 'the Properties panel fills in with the selected finding\'s detail');
        } else {
            t.hasText('[slot=properties] pk-empty-state >>> [part=heading]', 'Nothing selected', 'the Properties panel starts empty until a finding is chosen');
        }
    },
};
