// pk-heat-map phase 2 (#1721): the rows layout with compact values, the intensity scale (one hue, light to dark, percentage in the box), max-items with Other taking the worst severity of what it holds, and a narrow container where tiles drop their labels and nothing is a thin strip.
const rows = [{ id: 'a', label: 'Inbox', value: 1200, severity: 'warning' }, { id: 'b', label: 'Review', value: 800 }, { id: 'c', label: 'Blocked', value: 300, severity: 'danger' }, { id: 'd', label: 'Done', value: 2100, severity: 'success' }, { id: 'e', label: 'Parked', value: 150 }];
const heat = [['Auth', 40, 0.95], ['Billing', 30, 0.6], ['Search', 24, 0.35], ['Reports', 18, 0.15], ['Docs', 10, 0.05], ['API', 8, 0.8], ['Admin', 4, 0.2]].map(([label, value, intensity], i) => ({ id: `h${i}`, label, value, intensity }));
const capped = [{ id: 'a', label: 'Platform', value: 500 }, { id: 'b', label: 'Web', value: 300 }, { id: 'c', label: 'Mobile', value: 90, severity: 'info' }, { id: 'd', label: 'Docs', value: 60, severity: 'warning' }, { id: 'e', label: 'Admin', value: 40 }];
const narrow = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `Region ${i + 1}`, value: 10 + (i % 3), severity: ['neutral', 'info', 'warning'][i % 3] }));
const J = v => JSON.stringify(v);

export default {
    name: 'heat-map-modes',
    issue: [1721],
    elements: ['heat-map'],
    html: `<div id="stage"><pk-heat-map id="r" label="Queues" layout="rows" value-format="compact" items='${J(rows)}'></pk-heat-map><pk-heat-map id="i" label="Errors per service" scale="intensity" items='${J(heat)}'></pk-heat-map><pk-heat-map id="c" label="Capped" max-items="3" value-format="share" items='${J(capped)}'></pk-heat-map><div id="n"><pk-heat-map id="w" label="Narrow" min-box="40" items='${J(narrow)}'></pk-heat-map></div></div>`,
    steps: [{ waitFor: '#r >>> .box' }, { waitFor: '#i >>> .box' }, { waitFor: '#c >>> .box' }, { waitFor: '#w >>> .box' }, { shot: 'resting' }, { focus: '#i >>> .box' }, { shot: 'focus' }],
    expect(t) {
        for (const id of ['#r', '#i', '#c', '#w']) { t.visible(id, id); t.within(`${id} >>> .box`, `${id} >>> [part=map]`); }
        t.noOverlap('#r', '#i'); t.noOverlap('#i', '#c'); t.noOverlap('#c', '#w');
        t.hasText('#c >>> .other', 'Other (2)'); t.hasText('#c >>> .other .status', 'Warning');
        t.atLeast('#c >>> .other', 'width', 44); t.atLeast('#c >>> .other', 'height', 44);
        t.contrast('#i >>> .box:first-child .label', '#i >>> .box:first-child');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'focus') t.ringUnclipped('#i >>> .box:focus-visible');
    },
};
