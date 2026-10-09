// pk-button collapse (#991): the label folds into the icon at and below the named breakpoint, only for a button that has an icon, and the name stays.
export default {
    name: 'button-collapse',
    issue: [991],
    elements: ['button'],
    html: `<pk-stack>
<div><pk-button id="p" collapse="phone" icon-name="plus">Add item</pk-button> <pk-button id="t" collapse="tablet" variant="ghost" icon-name="search">Search</pk-button> <pk-button id="n" collapse="phone">No icon</pk-button> <pk-button id="o" icon-name="plus">Plain</pk-button></div>
</pk-stack>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        const w = id => t.rect(`#${id}`).width;
        if (phone) {
            t.ok(w('p') <= 48, `collapse=phone folds to a square icon button on a phone (got ${Math.round(w('p'))}px)`);
            t.ok(w('t') <= 48, `collapse=tablet folds on a phone too (got ${Math.round(w('t'))}px)`);
            t.ok(w('n') > 60, 'a button with no icon never collapses');
        } else {
            t.ok(w('p') > 60 && w('t') > 60, 'on desktop icon and text both show');
        }
        t.ok(w('o') > 60, 'a button without collapse keeps its text');
        t.ok(t.text('#p').includes('Add item'), 'the words stay in the control as the accessible name');
    },
};
