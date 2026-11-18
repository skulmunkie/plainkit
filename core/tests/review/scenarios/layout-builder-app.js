// The layout builder as a chrome-less module of the gallery app (#1996, `chrome: false`): the real app (app.html#/layout-builder) in a frame that is the whole viewport, so the shot shows what
// a visitor sees (no gallery bar, menu or breadcrumb around the builder). What is measured inside the page is the browser case in
// core/tests/browser/cases-site-tools.js; here the frame must fill the viewport and the screenshot is read by eye.
export default {
    name: 'layout-builder-app',
    elements: ['dock'],
    issue: 1996,
    html: '<iframe id="app" title="Layout builder app"></iframe>',
    setup(frame) {
        const f = frame.querySelector('#app');
        f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
        f.src = new URL('../../../app.html?theme=dark#/layout-builder', import.meta.url).href;
    },
    steps: [{ wait: 'settle' }, { wait: 2500 }, { shot: 'fills' }],
    expect(t) {
        const r = t.rect('#app');
        t.ok(r && r.width >= t.viewport.width - 1 && Math.abs(r.bottom - t.viewport.height) <= 1, 'the builder frame fills the viewport');
        t.ok(t.metric('html', 'scrollHeight') <= t.viewport.height + 1, 'the review page itself does not scroll');
    },
};
