// pk-property-grid (issue 429): an invalid value with its message, a disabled property and a collapsed group, on desktop and phone.
const CONFIG = { groups: [
    { heading: 'Dimensions', fields: [
        { key: 'width', type: 'number', label: 'Width (px)', min: 1, max: 4096, required: true },
        { key: 'height', type: 'number', label: 'Height (px)', min: 1, max: 4096 },
    ] },
    { heading: 'Output', fields: [
        { key: 'format', type: 'select', label: 'Format', options: ['PNG', 'JPEG', 'WebP'] },
        { key: 'transparent', type: 'switch', label: 'Transparent background' },
        { key: 'note', type: 'text', label: 'Export note', disabled: true },
        { key: 'quality', type: 'range', label: 'Quality', min: 0, max: 100, visibleWhen: { key: 'format', equals: 'JPEG' } },
        { key: 'accent', type: 'color', label: 'Accent colour' },
        { key: 'margin', type: 'unit', label: 'Margin', units: ['px', '%', 'rem'], min: 0, max: 100 },
    ] },
    { heading: 'Advanced (collapsed)', collapsed: true, fields: [{ key: 'seed', type: 'number', label: 'Seed' }] },
] };

export default {
    name: 'property-grid',
    issue: [429],
    elements: ['property-grid'],
    html: '<div id="stage" class="u-p-1r-1p25r"><pk-property-grid id="g"></pk-property-grid></div>',
    setup(frame) {
        const g = frame.querySelector('#g');
        g.config = CONFIG;
        g.values = { width: 0, height: 600, format: 'PNG', transparent: true, note: 'Locked by the template', quality: 80, accent: '#3366cc', margin: { value: 140, unit: '%' } };
    },
    steps: [
        { wait: 'settle' }, { shot: 'invalid' },
        { set: '#g', prop: 'values', value: { width: 0, height: 600, format: 'JPEG', transparent: true, note: 'Locked by the template', quality: 80, accent: '#3366cc', margin: { value: 140, unit: '%' } } }, { wait: 300 }, { shot: 'jpeg-quality-visible' },
        { click: '#g >>> pk-accordion-item:last-child >>> summary' }, { wait: 300 }, { shot: 'group-open' },
    ],
    expect(t) {
        t.visible('#g >>> pk-accordion-item >>> [part=heading]', 'the group heading');
        t.within('#g', '#stage');
        t.visible('#g >>> pk-field >>> [part=label]', 'a property label');
    },
};
