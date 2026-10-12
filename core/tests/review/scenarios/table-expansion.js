// pk-table host-controlled expansion (issue 1219): no toggle column with expander="none", and two named panels under one row that open separately.
export default {
    name: 'table-expansion',
    issue: [1219],
    elements: ['table'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-table id="t" label="POs" expandable expander="none" expanded='["1.lines","1.notes"]' columns='[{"key":"po","label":"PO"},{"key":"status","label":"Status"}]' rows='[{"id":1,"po":"PO 1042","status":"Open"},{"id":2,"po":"PO 1043","status":"Held"}]'>
<p slot="detail-1.lines">3 lines: Widget 1 x 20.</p>
<p slot="detail-1.notes">Ship together.</p>
<p slot="detail-2.notes">Held for credit review.</p>
</pk-table>
</div>`,
    steps: [{ shot: 'both-open' }, { set: '#t', prop: 'expanded', value: ['2.notes'] }, { shot: 'second-row' }],
    expect(t) {
        t.visible('#t >>> tbody tr', 'the first row');
        t.inViewport('#t >>> tbody tr');
        if (t.shot === 'both-open') { t.visible('p[slot="detail-1.lines"]', 'the lines panel'); t.visible('p[slot="detail-1.notes"]', 'the notes panel'); }
        else t.visible('p[slot="detail-2.notes"]', 'the second row notes panel');
    },
};
