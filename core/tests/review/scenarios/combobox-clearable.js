// pk-combobox with clearable (issue 1687): the clear button sits at the end of the box while a value is chosen, is a 44px target on a phone, and
// emptying it hides the button and leaves the placeholder.
const BOX = '#c >>> [part=box]';
const CLEAR = '#c >>> [part=clear]';

export default {
    name: 'combobox-clearable',
    issue: [1687],
    elements: ['combobox'],
    html: `<pk-stack>
<pk-combobox id="c" clearable label="Variant" placeholder="Search a variant" value="2"><option value="1">AC-1001 - Widget 1</option><option value="2">AC-1002 - Widget 2</option></pk-combobox>
</pk-stack>`,
    steps: [
        { shot: 'chosen' },
        { focus: '#c >>> [part=control]' },
        { shot: 'focused' },
        { click: CLEAR },
        { wait: 'settle' },
        { shot: 'cleared' },
    ],
    expect(t) {
        if (t.shot === 'chosen' || t.shot === 'focused') {
            t.visible(CLEAR, 'the clear button while a value is chosen');
            t.within(CLEAR, BOX);
            const phone = t.viewport.name === 'phone';
            if (phone) { t.atLeast(CLEAR, 'width', 44); t.atLeast(CLEAR, 'height', 44); }
        }
        if (t.shot === 'cleared') {
            t.hidden(CLEAR, 'the clear button once the value is empty');
            t.visible(BOX);
        }
    },
};
