// pk-page-header actions-overflow="phone" with a primary button and a dropdown in the actions slot (issue 1737): the overflow menu lists the dropdown's items one by one.
const TRIGGER = '#ph >>> [part="overflow-button"]';
export default {
    name: 'page-header-actions-menu',
    issue: [1737],
    elements: ['page-header'],
    viewports: ['phone'],
    html: `<pk-page-header id="ph" heading="Record" actions-overflow="phone"><pk-button slot="actions" variant="primary" icon-name="refresh">Sync</pk-button><pk-dropdown slot="actions"><pk-button slot="trigger" variant="ghost" icon icon-name="more" label="More actions"></pk-button><pk-menu-item type="header">Stock</pk-menu-item><pk-menu-item value="receive">Receive stock</pk-menu-item><pk-menu-item value="restructure">Restructure</pk-menu-item><pk-menu-item value="delete" danger>Delete</pk-menu-item></pk-dropdown></pk-page-header>`,
    steps: [{ click: TRIGGER }, { wait: 300 }, { shot: 'open' }],
    expect(t) { t.visible(TRIGGER, 'the overflow button'); },
};
