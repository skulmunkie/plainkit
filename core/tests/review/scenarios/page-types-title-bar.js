// Page types draw the same title bar as pk-page-header (#1734, #1735): config badges beside the title, a home crumb leading the trail, the actions folded into the overflow menu.
import { mountPage } from '../../../js/app.js';

export default {
    name: 'page-types-title-bar',
    issue: [1734, 1735],
    elements: ['list-page', 'settings-page', 'page-shell', 'page-header'],
    html: '<div id="boxes"><main id="a"></main><main id="b"></main></div>',
    async setup(frame) {
        const at = id => frame.querySelector(`#${id}`);
        const bar = { badges: [{ label: 'Live', variant: 'ok' }, { label: 'EU', variant: 'muted' }], homeHref: '/', actionsOverflow: 'always' };
        globalThis.__pages = await Promise.all([
            mountPage(at('a'), { type: 'list', config: { heading: 'Orders', breadcrumb: [{ label: 'Sales', href: '/s' }, { label: 'Orders' }], columns: [{ key: 'id', label: 'Order' }], load: () => ({ rows: [{ id: 1 }], total: 1 }), ...bar } }),
            mountPage(at('b'), { type: 'settings', config: { heading: 'Settings', breadcrumb: [{ label: 'Admin', href: '/a' }, { label: 'Settings' }], actions: [{ key: 'help', label: 'Help' }], sections: [{ heading: 'General', fields: [{ key: 'name', type: 'text', label: 'Name' }] }], ...bar } }),
        ]);
    },
    steps: [{ wait: 'settle' }, { wait: 300 }, { shot: 'bars' }],
    expect(t) {
        for (const id of ['a', 'b']) {
            const shell = document.querySelector(`#${id} :is(pk-list-page, pk-settings-page)`)?.shadowRoot?.querySelector('pk-page-shell');
            const root = shell?.part?.('header')?.shadowRoot;
            const chips = [...(shell?.querySelectorAll('pk-badge[slot="badges"]') ?? [])];
            t.ok(chips.length === 2 && chips.every(c => c.getBoundingClientRect().width > 0), `#${id}: both badges are drawn beside the title`);
            t.ok(!!root?.querySelector('[part="trail"] a[aria-label="Home"]'), `#${id}: the home crumb leads the trail`);
            t.inViewport(`#${id} pk-heading[level="1"]`);
        }
        const ob = document.querySelector('#b pk-settings-page')?.shadowRoot?.querySelector('pk-page-shell')?.part?.('header')?.shadowRoot?.querySelector('[part="overflow-button"]');
        t.ok(!!ob && ob.getBoundingClientRect().width > 0, '#b: the actions fold into the overflow menu button');
    },
};
