// Page types draw the same title bar as pk-page-header (#1734, #1735): config badges beside the title, a home crumb leading the trail, the actions folded into the overflow menu.
import { mountPage } from '../../../js/app.js';

export default {
    name: 'page-types-title-bar',
    issue: [1734, 1735],
    elements: ['list-page', 'settings-page', 'tool-page', 'page-shell', 'page-header'],
    html: '<div id="boxes"><main id="a"></main><main id="b"></main><main id="c"></main></div>',
    async setup(frame) {
        const at = id => frame.querySelector(`#${id}`);
        const bar = { badges: [{ label: 'Live', variant: 'ok' }, { label: 'EU', variant: 'muted' }], homeHref: '/', actionsOverflow: 'always' };
        globalThis.__pages = await Promise.all([
            mountPage(at('a'), { type: 'list', config: { heading: 'Orders', breadcrumb: [{ label: 'Sales', href: '/s' }, { label: 'Orders' }], columns: [{ key: 'id', label: 'Order' }], load: () => ({ rows: [{ id: 1 }], total: 1 }), ...bar } }),
            mountPage(at('b'), { type: 'settings', config: { heading: 'Settings', breadcrumb: [{ label: 'Admin', href: '/a' }, { label: 'Settings' }], actions: [{ key: 'help', label: 'Help' }], sections: [{ heading: 'General', fields: [{ key: 'name', type: 'text', label: 'Name' }] }], ...bar } }),
            mountPage(at('c'), { type: 'tool', config: { heading: 'Tax calculator', breadcrumb: [{ label: 'Tools', href: '/t' }, { label: 'Tax' }], actions: [{ key: 'reset', label: 'Reset', variant: 'secondary' }], badges: [{ label: 'Beta', variant: 'muted' }], input: [{ key: 'amount', type: 'number', label: 'Amount' }], runLabel: 'Add tax' } }),
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
        for (const id of ['a', 'b', 'c']) {

            t.ok(document.querySelectorAll(`#${id} pk-heading[level="1"]`).length === 1, `#${id}: exactly one level 1 title (the toolbar does not repeat it)`);
        }
        const tool = document.querySelector('#c pk-tool-page'), tshell = tool?.shadowRoot?.querySelector('pk-page-shell');
        t.hasText('#c pk-heading[level="1"]', 'Tax calculator');
        t.ok(!!tshell?.querySelector('pk-breadcrumb') && !!tshell?.querySelector('pk-badge[slot="badges"]') && !!tshell?.querySelector('pk-button[slot="actions"]'), '#c: the tool page draws its breadcrumb, badge and action');
        t.ok(tool.part('form').getBoundingClientRect().top >= tshell.part('header').getBoundingClientRect().bottom - 1, '#c: the form sits under the title bar');
        const ob = document.querySelector('#b pk-settings-page')?.shadowRoot?.querySelector('pk-page-shell')?.part?.('header')?.shadowRoot?.querySelector('[part="overflow-button"]');
        t.ok(!!ob && ob.getBoundingClientRect().width > 0, '#b: the actions fold into the overflow menu button');
    },
};
