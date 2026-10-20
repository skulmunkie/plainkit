// A pk-app-shell with `contain` (#1675): a region of fixed height (a camera preview) above a list that takes the rest of the body and scrolls on its own,
// with no wrapper element between the shell and the page. The sizes are set by the markup's own attributes; the rows come from setup (CSP allows no inline script).
export default {
    name: 'fill-height-camera',
    issue: [1675],
    elements: ['app-shell'],
    html: '<pk-app-shell contain><pk-heading level="1" slot="header">Scan</pk-heading><div id="fill"><pk-card id="preview" heading="Camera preview">Live preview</pk-card><div id="rows"></div></div></pk-app-shell>',
    setup(frame) {
        const fill = frame.querySelector('#fill'), rows = frame.querySelector('#rows');
        fill.style.cssText = 'display:flex;flex-direction:column;gap:1rem;min-block-size:0';
        rows.style.cssText = 'flex:1 1 0;min-block-size:0;overflow-y:auto';
        for (let i = 1; i <= 40; i++) { const r = frame.ownerDocument.createElement('div'); r.textContent = `Scanned item ${i}`; r.style.cssText = 'padding:0.75rem;border-block-end:1px solid var(--color-border)'; rows.append(r); }
    },
    steps: [{ wait: 'settle' }, { shot: 'top' }, { scroll: '#rows', to: 800 }, { shot: 'scrolled' }],
    expect(t) {
        t.inViewport('#rows');
        t.inViewport('#preview');
        t.flushBelow('#rows', '#preview', 20);
        t.ok(document.querySelector('#rows').scrollHeight > document.querySelector('#rows').clientHeight, 'the list scrolls on its own');
        t.ok(document.querySelector('#preview').getBoundingClientRect().top >= 0, 'the preview does not move away');
    },
};
