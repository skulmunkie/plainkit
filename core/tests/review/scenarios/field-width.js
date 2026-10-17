// pk-input and pk-select width (issue 1539): compact quantity, money and unit fields share one row, each at its token width, and none leaves the stage.
export default {
    name: 'field-width',
    issue: [1539],
    elements: ['input', 'select'],
    html: `<div id="stage" class="u-p-1r-1p25r"><pk-cluster id="row"><pk-input id="q" label="Qty" show-label width="xs" value="12"></pk-input><pk-input id="m" label="Price" show-label width="md" format="money" value="1250"></pk-input><pk-select id="u" label="Unit" show-label width="7rem"><option>kg</option><option>lb</option></pk-select><pk-input id="n" label="Note" show-label width="2xl" value="Handle with care"></pk-input></pk-cluster></div>`,
    steps: [{ shot: 'row' }],
    expect(t) {
        for (const id of ['q', 'm', 'u', 'n']) { t.visible('#' + id, id); t.within('#' + id, '#stage'); }
        t.ok(t.metric('#q', 'clientWidth') < t.metric('#m', 'clientWidth') + 1 && t.metric('#m', 'clientWidth') < t.metric('#n', 'clientWidth'), 'the widths do not follow xs < md < 2xl');
        t.noOverlap('#q', '#m'); t.noOverlap('#m', '#u');
    },
};
