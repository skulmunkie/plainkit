// Hints in a page-type config (#373): a field `hint` draws an info button beside the label (pk-tooltip help, in the pk-field label-action slot), a switch hint follows its switch,
// and a title-bar action `hint` wraps the button in a tooltip. A field or action without a hint draws exactly as before. States: resting, a field tip open on hover, an action tip open on hover.
const SP = '#sp';
const FIELD_TIP = '#sp >>> pk-field pk-tooltip';
const FIELD_HELP = '#sp >>> pk-field pk-tooltip >>> [part=help]';
const SAVE = '#sp >>> pk-page-header pk-tooltip pk-button';

export default {
    name: 'page-hints',
    issue: [373],
    elements: ['tooltip', 'settings-page', 'tool-page'],
    html: '<div class="rv-page"><pk-settings-page id="sp"></pk-settings-page></div>',
    setup(frame) {
        frame.querySelector('#sp').config = {
            heading: 'Company settings',
            actions: [{ key: 'save', label: 'Save', variant: 'primary', hint: 'Saves every section on this page' }, { key: 'reset', label: 'Reset' }],
            sections: [{ heading: 'Profile', fields: [
                { key: 'name', type: 'text', label: 'Company name', hint: 'Shown on invoices and in emails' },
                { key: 'email', type: 'email', label: 'Contact email' },
                { key: 'digest', type: 'switch', label: 'Weekly digest', hint: 'Sends a summary every Monday' },
            ] }],
        };
    },
    steps: [
        { wait: 'settle' }, { wait: 500 }, { shot: 'resting' },
        { hover: FIELD_HELP }, { wait: 700 }, { shot: 'field-tip' },
        { hover: SAVE }, { wait: 700 }, { shot: 'action-tip' },
    ],
    expect(t) {
        t.exists(FIELD_TIP);
        t.inViewport(FIELD_HELP);
        t.visible(SAVE, 'the Save button');
        t.inViewport(SAVE);
        // On a phone the info button's 44px tap box (pk-tooltip's own negative margins keep the layout at 20px) reaches 7px into the input's top edge; the visible glyph never does.
        t.noOverlap(FIELD_HELP, '#sp >>> pk-input', t.viewport.name === 'phone' ? 8 : 1);
    },
};
