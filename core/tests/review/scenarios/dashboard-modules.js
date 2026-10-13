// A dashboard composed from modules (#494, step 3): the Sales tab shows a working stat, a chart and a widget that fails (its own error card with Retry, the others unaffected);
// the Operations tab starts only when it is opened. The host is wired in setup() with fake modules, like the app-boundaries scenario, so the states are the real ones.
import { createModuleHost, defineModule } from '../../../js/app.js';

const DASH = '#app pk-dashboard-page';
const CARD = key => `${DASH} >>> pk-card[data-key="${key}"]`;
const c = (key, tab, label, kind = 'stat', size) => ({ key, for: ['ov'], tab, label, kind, size });

export default {
    name: 'dashboard-modules',
    elements: ['dashboard-page', 'card', 'stat', 'chart', 'tabs', 'button'],
    html: '<div id="app"></div>',
    setup(frame) {
        const home = defineModule({ id: 'home', routes: [{ path: '/', page: 'dashboard', config: { surface: 'ov', heading: 'Overview', tabs: [{ id: 'sales', label: 'Sales' }, { id: 'ops', label: 'Operations' }] } }] });
        const sales = defineModule({ id: 'sales', widgets: {
            mrr: { load: async () => ({ value: '$48.2k', subtext: 'monthly recurring', tone: 'positive', delta: '4.1' }) },
            churn: { load: async () => { throw new Error('The billing service did not answer.'); } },
            trend: { load: async () => ({ kind: 'bar', data: { labels: ['Jul', 'Aug', 'Sep'], series: [{ name: 'Revenue', values: [410, 520, 511] }] } }) },
        } });
        const ops = defineModule({ id: 'ops', widgets: { queue: { load: async () => ({ value: '12', subtext: 'tickets waiting' }) } } });
        const host = createModuleHost(frame.querySelector('#app'), { modules: [
            { id: 'home', title: 'Home', load: async () => home },
            { id: 'sales', title: 'Sales', load: async () => sales, contributes: [c('mrr', 'sales', 'Recurring revenue'), c('churn', 'sales', 'Churn'), c('trend', 'sales', 'Revenue by month', 'chart', 'lg')] },
            { id: 'ops', title: 'Ops', load: async () => ops, contributes: [c('queue', 'ops', 'Support queue')] },
        ], timeout: 60000, retries: 0, backoff: 1 });
        host.show('home');
    },
    steps: [
        { wait: 800 }, { shot: 'sales-tab' },
        { click: `${DASH} >>> pk-tab:nth-of-type(2)` }, { wait: 500 }, { shot: 'operations-tab' },
    ],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        t.inViewport('#app');
        if (t.shot === 'sales-tab') {
            for (const k of ['sales:mrr', 'sales:churn', 'sales:trend']) { t.exists(CARD(k)); t.visible(CARD(k), `the ${k} card`); t.within(CARD(k), '#app', 1); }
            t.exists(`${CARD('sales:mrr')} pk-stat`);
            t.exists(`${CARD('sales:churn')} pk-button`);
            t.visible(`${CARD('sales:churn')} pk-button`, 'Retry in the failed card');
            t.noOverlap(CARD('sales:mrr'), CARD('sales:churn'));
            t.noOverlap(CARD('sales:churn'), CARD('sales:trend'));
            t.absent(CARD('ops:queue') + ' pk-stat');
            const a = t.rect(CARD('sales:mrr')), b = t.rect(CARD('sales:churn')), w = t.rect(CARD('sales:trend')), g = t.rect(DASH + ' >>> [part="grid"]');
            if (w && g) t.ok(phone ? Math.abs(w.width - g.width) < 2 : Math.abs(w.width - g.width) < 2 && w.y >= a.bottom - 1, 'size lg takes the whole row (a row of its own on a wide screen, the one column on a phone)');
            if (a && b) {
                if (phone) t.ok(b.y >= a.bottom - 1, 'on a phone the cards stack in one column');
                else t.ok(Math.abs(a.y - b.y) <= 2, 'on a wide screen the first cards share a row');
            }
        }
        if (t.shot === 'operations-tab') {
            t.visible(CARD('ops:queue'), 'the operations card');
            t.exists(`${CARD('ops:queue')} pk-stat`);
        }
    },
};
