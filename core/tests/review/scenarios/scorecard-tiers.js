// The scorecard's "Composition by tier" section (#769, modules/scorecard): mounted with a small fixture of the build's tier report (passed as an object,
// which loadJson takes as-is, so nothing is fetched). One row per tier and one per rule, side by side with the debt totals.
const FIXTURE = {
    version: 1,
    tiers: ['element', 'component', 'page', 'shell'],
    rules: ['C1', 'C4', 'D1', 'S3', 'T1'],
    counts: { element: 91, component: 16, page: 12, shell: 1 },
    total: 120,
    debt: {
        C1: { element: 1, component: 1, page: 0, shell: 0 },
        C4: { element: 1, component: 0, page: 0, shell: 0 },
        D1: { element: 0, component: 7, page: 0, shell: 0 },
        S3: { element: 0, component: 29, page: 0, shell: 0 },
        T1: { element: 0, component: 1, page: 1, shell: 0 },
    },
    debtTotal: 41,
};

export default {
    name: 'scorecard-tiers',
    elements: ['table', 'card', 'badge'],
    html: '<div id="mount"></div>',
    async setup(frame) {
        // Imported here, not at the top: the scenario module is also loaded in Node, where the module's DOM code must not run.
        const { mountScorecard } = await import('../../../modules/scorecard/scorecard.js');
        const card = await mountScorecard(frame.querySelector('#mount'), { sections: ['tiers'], data: { tiers: FIXTURE } });
        await card.ready;
    },
    steps: [{ wait: 'settle' }, { wait: 500 }, { shot: 'rest' }],
    expect(t) {
        t.exists('#mount pk-card', 'the section is a pk-card');
        t.exists('#mount pk-table', 'the tables are pk-table');
        t.exists('#mount pk-card[heading="Composition by tier"]', 'the card is headed Composition by tier');
        t.hasText('#mount pk-card', '120 elements');
        t.hasText('#mount pk-card', '41 baseline debt');
        t.visible('#mount pk-table >>> tbody');
        t.hasText('#mount pk-table >>> tbody', 'Shell');
    },
};
