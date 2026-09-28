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
        g.values = { width: 0, height: 600, format: 'PNG', transparent: true, note: 'Locked by the template' };
    },
    steps: [
        { wait: 'settle' }, { shot: 'invalid' },
        { click: '#g >>> pk-accordion-item:last-child >>> summary' }, { wait: 300 }, { shot: 'group-open' },
    ],
    expect(t) {
        t.visible('#g >>> pk-accordion-item >>> [part=heading]', 'the group heading');
        t.inViewport('#g');
    },
};
