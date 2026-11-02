// Counterpart of metric-page-overflow (issue 1873): a page that fits is measured as fitting, with a real page width behind the comparison.
export default {
    name: 'metric-page-fit',
    issue: [1873],
    elements: ['card'],
    html: '<div id="stage"><p id="short">A short line that fits the page.</p></div>',
    steps: [{ wait: 200 }, { shot: 'fitting' }],
    expect(t) {
        t.ok(t.metric('html', 'clientWidth') > 0, 'the page width is read');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the fitting fixture does not scroll sideways');
    },
};
