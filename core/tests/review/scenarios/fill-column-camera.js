// pk-fill-column (#1675) in a pk-app-shell with contain: a camera preview of fixed height above a list that fills the rest of the body and scrolls on its own, no wrapper.
export default {
    name: 'fill-column-camera',
    issue: [1675],
    elements: ['fill-column', 'app-shell'],
    html: '<pk-app-shell contain><pk-heading level="1" slot="header">Scan</pk-heading><pk-fill-column id="fc" fixed="10rem"><pk-card slot="fixed" heading="Camera preview">Live preview</pk-card><div id="rows"></div></pk-fill-column></pk-app-shell>',
    setup(frame) {
        const rows = frame.querySelector('#rows');
        for (let i = 1; i <= 40; i++) { const r = frame.ownerDocument.createElement('div'); r.textContent = `Scanned item ${i}`; r.style.padding = '0.75rem'; rows.append(r); }
    },
    steps: [{ wait: 'settle' }, { shot: 'top' }, { scroll: '#fc >>> [part=rest]', to: 800 }, { shot: 'scrolled' }],
    expect(t) {
        t.inViewport('#fc');
        t.within('#fc >>> [part=fixed]', '#fc');
        t.within('#fc >>> [part=rest]', '#fc');
    },
};
