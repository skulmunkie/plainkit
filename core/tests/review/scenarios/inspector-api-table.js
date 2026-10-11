// The Details inspector's API tables (#1113): on a phone each row is a labelled card, on a desktop the drawer holds a table that scrolls inside its own region with the Name column fixed.
// The Properties table of the Button page, opened from the Details button; the cells are slotted spans, so their boxes can be measured.
export default {
    name: 'inspector-api-table',
    issue: [1113],
    elements: ['table', 'drawer'],
    html: '<div id="host"></div>',
    async setup(frame) {
        history.replaceState(null, '', '#/elements/pk-button');
        for (const css of ['../../../site/site.css', '../../../site/gallery/gallery.css']) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL(css, import.meta.url).href }));
        frame.classList.add('site');
        frame.querySelector('#host').className = 'site-body';
        const { mountGallery } = await import('../../../site/gallery/gallery.js');
        await mountGallery(frame.querySelector('#host'), { chrome: 'full', init: false });
    },
    steps: [
        { wait: 'settle' }, { wait: 2500 },
        { click: '#gx-inspect', on: ['phone'] }, { wait: 800 },
        { set: '#gx-inspector-body pk-accordion-item', prop: 'open', value: false }, { wait: 400 }, { set: '#gx-inspector-body h2', prop: 'hidden', value: true }, { set: '#gx-inspector-body p.muted', prop: 'hidden', value: true }, { set: '#gx-inspector-body pk-stack > p:not(.muted)', prop: 'hidden', value: true }, { wait: 300 }, { shot: 'properties' },
    ],
    expect(t) {
        const open = document.querySelector('#gx-inspector')?.hasAttribute('open');
        t.ok(open, 'the Details drawer is open');
        t.exists('#gx-inspector-body pk-table');
        t.within('#gx-inspector-body pk-table', '#gx-inspector-body');
        const cell = c => `#gx-inspector-body pk-table [slot="cell-0-c${c}"]`;
        t.noOverlap(cell(1), cell(2)); t.noOverlap(cell(2), cell(3));
        if (t.viewport.name === 'phone') {
            // Cards: the four cells of a row stack, each under the one before it.
            const y = c => t.rect(cell(c))?.y ?? 0;
            t.ok(y(1) > y(0) && y(2) > y(1) && y(3) > y(2), 'a row is a card: its cells stack one under the other');
        }
    },
};
