// pk-wizard-page (#2011): a step of field specs (a pk-field-group). The city list follows the country (optionsBy) and the postal code appears for Canada (whenExpr).
const WP = 'pk-wizard-page';
const P = `${WP} >>> `;
const G = `${P}pk-field-group >>> `;

export default {
    name: 'wizard-page-specs',
    elements: ['wizard-page', 'field-group', 'stepper', 'card', 'form', 'field', 'select', 'input', 'button'],
    html: '<pk-wizard-page></pk-wizard-page>',
    setup(frame) {
        frame.ownerDocument.defaultView.addEventListener('beforeunload', e => e.stopImmediatePropagation(), true);
        frame.querySelector(WP).config = {
            heading: 'Where', review: true,
            steps: [{ id: 'where', label: 'Where', specs: [
                { key: 'country', label: 'Country', kind: 'select', options: [{ value: 'us', label: 'United States' }, { value: 'ca', label: 'Canada' }] },
                { key: 'city', label: 'City', kind: 'select', optionsBy: { field: 'country', map: { us: [{ value: 'nyc', label: 'New York' }], ca: [{ value: 'yyz', label: 'Toronto' }, { value: 'yvr', label: 'Vancouver' }] } } },
                { key: 'zip', label: 'Postal code', required: true, whenExpr: "country == 'ca'" },
            ] }],
        };
    },
    steps: [
        { waitFor: `${G}pk-select` }, { shot: 'united-states' },
        { focus: `${G}pk-select >>> select` }, { key: 'ArrowDown' }, { wait: 'settle' }, { shot: 'canada' },
    ],
    expect(t) {
        t.inViewport(WP);
        t.within(`${G}pk-field`, `${P}[part=card]`);
        if (t.shot === 'united-states') t.hasText(`${P}[part=heading]`, 'Where');
        if (t.shot === 'canada') { t.visible(`${G}pk-input`, 'the postal code, shown for Canada'); t.noOverlap(`${G}pk-field:nth-child(2)`, `${G}pk-field:nth-child(3)`); }
    },
};
