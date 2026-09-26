// The app module host's boundaries (#349): what the page shows while a module loads (a skeleton with nothing shown yet, the previous module covered otherwise), when an
// import fails (a danger alert with Retry, the previous module still there), when a module's mount throws, when access is denied, and when a route has no page. The host
// is wired in setup(); the buttons drive it like a person navigating, so the states are the real ones, not drawings.
import { createModuleHost, defineModule } from '../../../js/app.js';

const page = (id, title, text) => defineModule({ id, title, routes: [{ path: '/', page: 'custom', config: { mount: el => { const c = el.ownerDocument.createElement('pk-card'); c.setAttribute('heading', title); c.textContent = text; el.append(c); } } }] });
const BUTTONS = [['go-ok', 'Orders'], ['go-slow-a', 'Slow A'], ['release-a', 'Release A'], ['go-slow-b', 'Slow B'], ['release-b', 'Release B'], ['go-broken', 'Broken'], ['heal', 'Heal'], ['go-throws', 'Throws'], ['go-denied', 'Denied'], ['go-missing', 'Missing']];
const ALERT = '#app pk-alert[kind=danger]';

export default {
    name: 'app-boundaries',
    elements: ['alert', 'loading-overlay', 'skeleton', 'empty-state', 'button'],
    html: `<pk-stack gap="md"><pk-cluster gap="sm">${BUTTONS.map(([id, label]) => `<pk-button id="${id}" variant="secondary" size="sm">${label}</pk-button>`).join('')}</pk-cluster><div id="app"></div></pk-stack>`,
    setup(frame) {
        const gates = {};
        let healthy = false;
        const slow = (id, title) => ({ id, title, load: () => new Promise(resolve => { gates[id] = () => resolve({ default: page(id, title, `${title} is loaded and shows its own content.`) }); }) });
        const host = createModuleHost(frame.querySelector('#app'), {
            modules: [
                { id: 'ok', title: 'Orders', load: async () => page('ok', 'Orders', 'The orders module is mounted.') },
                slow('slow-a', 'Reports'), slow('slow-b', 'Exports'),
                { id: 'broken', title: 'Broken', load: async () => { if (!healthy) throw new Error('Failed to fetch dynamically imported module: /modules/broken.js'); return { default: page('broken', 'Broken', 'It loaded on the second try.') }; } },
                { id: 'throws', title: 'Throws', load: async () => ({ default: defineModule({ id: 'throws', mount() { throw new Error('The module threw while starting.'); } }) }) },
                { id: 'denied', title: 'Payroll', can: () => false, load: async () => { throw new Error('never loaded'); } },
            ],
            timeout: 60000, retries: 0, backoff: 1,
        });
        const on = (id, fn) => frame.querySelector(`#${id}`).addEventListener('click', fn);
        for (const [id, mod] of [['go-ok', 'ok'], ['go-slow-a', 'slow-a'], ['go-slow-b', 'slow-b'], ['go-broken', 'broken'], ['go-throws', 'throws'], ['go-denied', 'denied']]) on(id, () => host.show(mod));
        on('release-a', () => gates['slow-a']?.());
        on('release-b', () => gates['slow-b']?.());
        on('heal', () => { healthy = true; });
        on('go-missing', () => host.open('/ok/nothing-here'));
    },
    steps: [
        { click: '#go-slow-a' }, { wait: 250 }, { shot: 'loading-first' },
        { click: '#release-a' }, { wait: 400 }, { shot: 'loaded' },
        { click: '#go-slow-b' }, { wait: 250 }, { shot: 'loading-over-module' },
        { click: '#release-b' }, { wait: 400 },
        { click: '#go-broken' }, { wait: 400 }, { shot: 'import-error' },
        { click: '#heal' }, { click: '#app pk-alert pk-button' }, { wait: 500 }, { shot: 'retry-ok' },
        { click: '#go-throws' }, { wait: 400 }, { shot: 'mount-error' },
        { click: '#go-denied' }, { wait: 400 }, { shot: 'forbidden' },
        { click: '#go-ok' }, { wait: 400 }, { click: '#go-missing' }, { wait: 400 }, { shot: 'not-found' },
    ],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        const state = '#app pk-empty-state';
        t.inViewport('#app');
        if (t.shot === 'loading-first') {
            t.visible('#app pk-skeleton', 'the skeleton that holds the space');
            t.atLeast('#app pk-skeleton', 'height', 200);
            t.hidden(ALERT, 'the error alert');
        }
        if (t.shot === 'loaded') { t.absent('#app pk-skeleton'); t.hasText('#app pk-card', 'is loaded'); t.hidden(ALERT, 'the error alert'); }
        if (t.shot === 'loading-over-module') {
            t.exists('#app pk-loading-overlay[busy]');
            t.visible('#app pk-card', 'the previous module, covered but still there');
            t.hasText('#app pk-card', 'is loaded');
        }
        if (t.shot === 'import-error') {
            t.visible(ALERT, 'the error alert');
            t.hasText(ALERT, 'Failed to fetch');
            t.ok(t.attr(ALERT, 'heading') === 'Could not load Broken', `the heading is "${t.attr(ALERT, 'heading')}"`);
            t.within(ALERT, '#app', 1);
            t.visible('#app pk-alert pk-button', 'the Retry button');
            t.atLeast('#app pk-alert pk-button', 'height', phone ? 32 : 24);
            t.within('#app pk-alert pk-button', ALERT, 1);
            t.visible('#app pk-card', 'the previous module stays');
            t.noOverlap(ALERT, '#app pk-card');
        }
        if (t.shot === 'retry-ok') { t.hidden(ALERT, 'the error alert after a successful retry'); t.hasText('#app pk-card', 'second try'); }
        if (t.shot === 'mount-error') {
            t.visible(ALERT, 'the error alert');
            t.hasText(ALERT, 'threw while starting');
            t.visible(state, 'a placeholder instead of a blank page');
            t.noOverlap(ALERT, state);
            t.within(ALERT, '#app', 1);
        }
        if (t.shot === 'forbidden') {
            t.visible(state, 'the forbidden state');
            t.ok(t.attr(state, 'heading') === 'Not allowed', `the heading is "${t.attr(state, 'heading')}"`);
            t.hidden(ALERT, 'the error alert');
            t.inViewport(state);
        }
        if (t.shot === 'not-found') {
            t.visible(state, 'the not-found state');
            t.ok(t.attr(state, 'heading') === 'Not found', `the heading is "${t.attr(state, 'heading')}"`);
            t.inViewport(state);
        }
    },
};
