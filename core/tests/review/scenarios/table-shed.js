// pk-table shed (issue 1218): a column with shed 1, 2 or 3 drops out when the table's own width is under 24, 36 or 48rem, whatever the viewport:
// the same columns in a narrow and a wide grid cell shed differently, and a table in cards layout keeps every column on a phone.
const columns = JSON.stringify([{ key: 'name', label: 'Name' }, { key: 'plan', label: 'Plan', shed: 1 }, { key: 'seats', label: 'Seats', type: 'number', shed: 2 }, { key: 'owner', label: 'Owner', shed: 3 }]);
const rows = JSON.stringify([{ id: 1, name: 'Acme', plan: 'Team', seats: 12, owner: 'Ada' }, { id: 2, name: 'Globex', plan: 'Pro', seats: 4, owner: 'Grace' }]);


export default {
    name: 'table-shed',
    issue: [1218],
    elements: ['table'],
    html: `<div class="u-p-1r-1p25r"><pk-grid ratio="1:3">
<pk-table id="narrow" label="Accounts, narrow pane" columns='${columns}' rows='${rows}'></pk-table>
<pk-table id="wide" label="Accounts, wide pane" columns='${columns}' rows='${rows}'></pk-table>
</pk-grid>
<pk-table id="cards" cards label="Accounts, cards" columns='${columns}' rows='${rows}'></pk-table></div>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        for (const id of ['narrow', 'wide']) {
            const w = t.rect(`#${id}`).width, rem = parseFloat(t.style('pk-grid', 'font-size'));
            for (const [key, min] of [['plan', 24], ['seats', 36], ['owner', 48]]) {
                const cell = `#${id} >>> td[data-key=${key}]`;
                if (w > min * rem) t.visible(cell, `${id} (${Math.round(w)}px) keeps ${key}`); else t.hidden(cell, `${id} (${Math.round(w)}px) sheds ${key}`);
            }
            t.visible(`#${id} >>> td[data-key=name]`, `${id} keeps the unmarked column`);
        }
        if (t.viewport.name === 'desktop') t.visible('#wide >>> td[data-key=owner]', 'the wide pane keeps every column'), t.hidden('#narrow >>> td[data-key=owner]', 'the narrow pane sheds owner');
        if (t.viewport.name === 'phone') for (const k of ['plan', 'seats', 'owner']) t.visible(`#cards >>> td[data-key=${k}]`, `the phone cards layout keeps ${k}`);
    },
};
