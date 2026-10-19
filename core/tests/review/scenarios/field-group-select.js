// A field group's select-mode combobox (issue 1621): the opened list is the SDK's themed list, not the browser's popup. Open under its button, inside the viewport, in both themes.
export default {
    name: 'field-group-select',
    issue: [1621],
    elements: ['field-group', 'combobox'],
    html: '<div class="u-p-1r-1p25r"><pk-field-group id="g" label="Order"></pk-field-group></div>',
    setup(frame) {
        const g = frame.querySelector('#g');
        g.fields = [{ key: 'ch', label: 'Channel', kind: 'combobox', mode: 'select', placeholder: 'Choose a channel', options: [{ value: 'web', label: 'Web' }, { value: 'market', label: 'Market' }, { value: 'live', label: 'Live' }] }];
        g.fields.push({ key: 'st', label: 'Status (kind select, styled)', kind: 'select', styled: true, required: true, options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] });
        g.values = { ch: 'market', st: 'open' };
    },
    steps: [{ wait: 600 }, { shot: 'closed' }, { click: '#g >>> pk-combobox >>> [part=trigger]' }, { shot: 'open' }, { key: 'Escape' }, { click: '#g >>> pk-field:nth-child(2) pk-combobox >>> [part=trigger]' }, { shot: 'open-styled-select' }],
    expect(t) {
        if (t.shot === 'open-styled-select') { const Q = '#g >>> pk-field:nth-child(2) pk-combobox >>> [part=popup]'; t.visible(Q, 'the styled select list'); t.inViewport(Q); return; }
        if (t.shot !== 'open') return;
        const P = '#g >>> pk-combobox >>> [part=popup]';
        t.visible(P, 'the open list'); t.inViewport(P);
        t.ok(t.metric(P, 'clientHeight') > 60, 'the list is too short');
    },
};
