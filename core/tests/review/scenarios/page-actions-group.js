// A group menu in the title bar (#1943, phase 3): items sharing a group are one menu button beside the plain actions; opened it lists the items in order (a disabled one dimmed,
// a warn one in the danger colour), inside the viewport on a phone, and mirrored right to left. Every shot is opened and read.
const ACTIONS = '[{"key":"export","label":"Export","icon":"download","variant":"ghost"},{"key":"copy","label":"Copy","group":"More"},{"key":"archive","label":"Archive","group":"More","disabled":true},{"key":"delete","label":"Delete","group":"More","variant":"warn"},{"key":"share","label":"Share","icon":"share"}]';
export default {
    name: 'page-actions-group',
    issue: [1943],
    elements: ['page-header', 'tool-page', 'dropdown', 'menu-item'],
    html: `<div id="stage" class="u-p-1r-1p25r"><pk-tool-page id="p1" config='{"heading":"Orders","newAction":{"key":"new","label":"New order","icon":"plus"},"actions":${ACTIONS}}'></pk-tool-page></div>`,
    steps: [
        { waitFor: '#p1 >>> pk-dropdown pk-button' }, { wait: 'settle' }, { shot: 'rest' },
        { click: '#p1 >>> pk-dropdown pk-button' }, { wait: 'settle' }, { shot: 'menu' },
        { key: 'Escape' }, { set: '#stage', attr: 'dir', value: 'rtl' }, { wait: 'settle' },
        { click: '#p1 >>> pk-dropdown pk-button' }, { wait: 'settle' }, { shot: 'rtl' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible('#p1 >>> pk-dropdown pk-button', 'the group trigger');
        t.inViewport('#p1 >>> pk-dropdown pk-button');
        if (t.shot.startsWith('menu') || t.shot.startsWith('rtl')) t.inViewport('#p1 >>> pk-dropdown pk-menu-item');
    },
};
