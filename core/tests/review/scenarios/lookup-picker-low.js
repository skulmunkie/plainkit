// pk-lookup-picker (#1966): opened low on a short viewport, a long list. The panel is cut to the room on its side (or flips up), scrolls itself and stays inside the viewport.
const CTL = '#low >>> [part=control]';
const PANEL = '#low >>> [part=popover] >>> [part=panel]';
const ALL = Array.from({ length: 40 }, (_, i) => ({ id: `C${i + 1}`, name: `Customer ${i + 1} Hardware and Fasteners`, city: i % 2 ? 'Oslo' : 'Lima' }));

export default {
    name: 'lookup-picker-low',
    issue: [1966],
    elements: ['lookup-picker'],
    html: '<div id="stage"><pk-lookup-picker id="low" label="Customer" placeholder="Choose a customer"></pk-lookup-picker></div>',
    setup(frame) {
        const el = frame.querySelector('#low');
        Object.assign(el, { columns: [{ key: 'name', label: 'Name' }, { key: 'city', label: 'City' }], pageSize: 40 });
        el.load = async q => ({ rows: ALL.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: ALL.length });
        const s = frame.querySelector('#stage').style; // the field sits low in the viewport
        s.position = 'fixed'; s.insetInline = '16px'; s.insetBlockStart = '70vh';
    },
    steps: [{ click: CTL }, { waitFor: PANEL }, { wait: 'settle' }, { shot: 'open-low' }, { scroll: PANEL, to: 100000 }, { wait: 'settle' }, { shot: 'scrolled' }],
    expect(t) {
        t.visible(PANEL, 'the popup'); t.inViewport(PANEL); t.noOverlap(CTL, PANEL, 'the popup over its own field');
        t.ok(t.metric(PANEL, 'scrollHeight') > t.metric(PANEL, 'clientHeight'), 'the popup scrolls its own rows');
    },
};
