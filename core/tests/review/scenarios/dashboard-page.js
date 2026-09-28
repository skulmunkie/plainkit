// pk-dashboard-page (#489): a filter bar, two tabs of widgets, a slow widget still loading, an error widget with Retry, then the second tab opened.
// The element is wired in setup(): load() is a callback (a script, never markup); the slow widget never settles so its loading card can be shot.
const DP = 'pk-dashboard-page';
const CARD = key => `${DP} >>> pk-card[data-key=${key}]`;

export default {
    name: 'dashboard-page',
    elements: ['dashboard-page', 'card', 'tabs', 'stat', 'chart', 'page-header', 'breadcrumb', 'button'],
    html: '<pk-dashboard-page></pk-dashboard-page>',
    setup(frame) {
        const el = frame.querySelector(DP);
        el.config = {
            heading: 'Overview',
            breadcrumb: [{ label: 'Home', href: '#' }, { label: 'Reports', href: '#' }],
            actions: [{ key: 'export', label: 'Export', variant: 'secondary' }],
            tabs: [{ id: 'overview', label: 'Overview' }, { id: 'sales', label: 'Sales' }],
            widgets: [
                { key: 'revenue', tab: 'overview', label: 'Revenue', kind: 'stat' },
                { key: 'orders', tab: 'overview', label: 'Open orders', kind: 'stat' },
                { key: 'slow', tab: 'overview', label: 'Slow report', kind: 'stat' },
                { key: 'broken', tab: 'overview', label: 'Broken feed', kind: 'stat' },
                { key: 'churn', tab: 'sales', label: 'Churn', kind: 'stat' },
                { key: 'trend', tab: 'sales', label: 'Sales trend', kind: 'chart' },
            ],
            filters: [{ key: 'range', type: 'select', label: 'Date range', options: [{ value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }] }],
        };
        let attempts = 0;
        el.load = key => {
            if (key === 'slow') return new Promise(() => {});
            if (key === 'broken' && ++attempts === 1) return Promise.reject(new Error('The feed did not answer.'));
            if (key === 'trend') return Promise.resolve({ data: { labels: ['Jan', 'Feb', 'Mar'], series: [{ name: 'Sales', values: [3, 5, 4] }] } });
            return Promise.resolve({ value: key === 'revenue' ? '$48,200' : key === 'orders' ? '128' : '2.4%', delta: '+4%', tone: 'positive' });
        };
    },
    steps: [
        { wait: 500 }, { shot: 'overview' },
        { click: `${CARD('broken')} >>> [part=state] pk-button` }, { wait: 400 }, { shot: 'retried' },
        { click: `${DP} >>> pk-tab[value=sales]` }, { wait: 500 }, { shot: 'sales' },
    ],
    expect(t) {
        // The page grows taller than a phone screen (stacked widgets), so only the top of it must be on screen; every card stays inside the page's width.
        if (t.shot === 'overview') t.inViewport(`${DP} >>> [part=filters]`); // later shots follow a click that may have scrolled the phone page
        t.within(`${DP} >>> pk-tabs`, DP, 1);
        t.visible(`${DP} >>> [part=header] pk-page-header`, 'the shared title bar');
        t.noOverlap(`${DP} >>> [part=header]`, `${DP} >>> [part=filters]`);
        if (t.shot === 'overview') {
            t.visible(`${DP} >>> [part=filters] pk-select`, 'the filter');
            t.noOverlap(`${DP} >>> [part=filters]`, `${DP} >>> pk-tabs`);
            t.hasText(`${CARD('revenue')} pk-stat >>> [part=value]`, '$48,200');
            t.visible(`${CARD('slow')} >>> [part=state] pk-skeleton`, 'the slow widget loading');
            t.visible(`${CARD('broken')} >>> [part=state] pk-alert`, 'the error alert');
            t.visible(`${CARD('broken')} >>> [part=state] pk-button`, 'the Retry button');
            t.within(CARD('broken'), DP, 1);
            t.noOverlap(CARD('revenue'), CARD('orders'));
        }
        if (t.shot === 'sales') {
            t.visible(CARD('churn'), 'the Sales tab widgets');
            t.visible(CARD('trend'), 'the chart widget');
        }
    },
};
