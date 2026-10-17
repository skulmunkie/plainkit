// pk-input and pk-textarea font (issue 1540): a mono query field and a mono JSON editor sit beside sans fields; the label keeps the page font and nothing leaves the stage.
export default {
    name: 'field-font-mono',
    issue: [1540],
    elements: ['input', 'textarea'],
    html: `<div id="stage" class="u-p-1r-1p25r"><pk-stack><pk-input id="q" label="Query" show-label font="mono" value="select id, total from orders where total > 100"></pk-input><pk-textarea id="j" label="Payload" show-label font="mono" rows="3" value='{ "id": 12, "total": 1250.5 }'></pk-textarea><pk-input id="s" label="Name" show-label font="sans" value="Plain sans field"></pk-input></pk-stack></div>`,
    steps: [{ shot: 'fonts' }],
    expect(t) {
        for (const id of ['q', 'j', 's']) { t.visible('#' + id, id); t.within('#' + id, '#stage'); }
        t.ok(/mono|consolas|courier/i.test(t.style('#q >>> input', 'font-family')), 'the query input is not mono');
        t.ok(/mono|consolas|courier/i.test(t.style('#j >>> textarea', 'font-family')), 'the payload textarea is not mono');
        t.ok(!/mono|consolas|courier/i.test(t.style('#s >>> input', 'font-family')), 'the sans input is mono');
    },
};
