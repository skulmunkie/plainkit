// pk-toast-stack above a persistent bottom bar (#2136): a pk-app-shell with a footer strip and a bottom-end toast. The consumer sets
// --pk-toast-stack-offset-block-end to the footer's height (var(--app-footer-h)), so the toast keeps its normal margin above the bar instead of covering it.
export default {
    name: 'toast-stack-footer-bar',
    elements: ['toast-stack', 'app-shell'],
    html: `<pk-app-shell id="shell"><span slot="brand">Acme</span><p>Page content.</p><span slot="footer" id="status">Status: all systems normal</span></pk-app-shell>
<pk-toast-stack id="stack" position="bottom-end"><pk-toast id="t1" kind="success" duration="0">Saved.</pk-toast></pk-toast-stack>`,
    setup(frame) { frame.querySelector('#stack').style.setProperty('--pk-toast-stack-offset-block-end', 'var(--app-footer-h)'); },
    steps: [{ wait: 'settle' }, { shot: 'above-footer' }],
    expect(t) {
        t.inViewport('#t1');
        t.noOverlap('#t1', '#status');
        const toast = t.rect('#t1'), bar = t.rect('#shell >>> [part=footer]');
        if (toast && bar) t.ok(toast.bottom <= bar.y, `the toast bottom (${Math.round(toast.bottom)}) is inside the footer bar, which starts at ${Math.round(bar.y)}`);
    },
};
