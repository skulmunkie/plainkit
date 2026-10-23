// pk-heat-map (#1721, phase 1): many items (300 become the biggest boxes plus one Other box), one dominant item, and a narrow container: boxes never overflow the map and the Other box says how many it holds.
const many = Array.from({ length: 300 }, (_, i) => ({ id: `k${i}`, label: `Area ${i + 1}`, value: Math.max(1, Math.round(400 / (i + 1))), severity: ['neutral', 'info', 'warning', 'danger', 'success'][i % 5] }));
const dominant = [{ id: 'p', label: 'Platform', value: 900, severity: 'danger' }, { id: 'w', label: 'Web', value: 40 }, { id: 'm', label: 'Mobile', value: 30, severity: 'warning' }, { id: 'd', label: 'Docs', value: 20, severity: 'success' }];

export default {
    name: 'heat-map-dense',
    issue: [1721],
    elements: ['heat-map'],
    html: `<div id="stage"><pk-heat-map id="a" label="Many areas" items='${JSON.stringify(many)}'></pk-heat-map><pk-heat-map id="b" label="One dominant" items='${JSON.stringify(dominant)}'></pk-heat-map></div>`,
    steps: [{ waitFor: '#a >>> .box' }, { waitFor: '#b >>> .box' }, { shot: 'resting' }],
    expect(t) {
        t.visible('#a >>> .other', 'the Other box'); t.hasText('#a >>> .other', 'Other (');
        t.within('#a >>> .other', '#a >>> [part=map]'); t.within('#b >>> .box', '#b >>> [part=map]');
        t.noOverlap('#a', '#b');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
