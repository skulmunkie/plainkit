// pk-page-header sticky + sticky-from (issue 1740): below the breakpoint the header is released to normal flow and must not stay a stacking context,
// so a dropdown opened from its actions is drawn over the content below it, not under it.
export default {
    name: 'page-header-sticky-from-menu',
    issue: [1740],
    elements: ['page-header', 'dropdown'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-page-header id="ph" sticky sticky-from="tablet" heading="Purchase order 1042">
<pk-dropdown slot="actions" id="dd" placement="bottom-end"><pk-button slot="trigger" id="go">Actions</pk-button><pk-menu-item>Receive</pk-menu-item><pk-menu-item>Print</pk-menu-item><pk-menu-item>Duplicate</pk-menu-item><pk-menu-item>Cancel order</pk-menu-item></pk-dropdown>
</pk-page-header>
<pk-card id="card"><p>Order lines, totals and notes sit here, directly below the header.</p><p>More content so the card is tall enough for the menu to cover.</p></pk-card>
</div>`,
    steps: [
        { click: '#go' }, { wait: 'settle' }, { shot: 'open' },
    ],
    expect(t) {
        if (t.viewport.name === 'phone') {
            t.ok(t.style('#ph', 'position') === 'static', 'the header is released below the breakpoint');
            t.ok(t.style('#ph', 'z-index') === 'auto' && t.style('#ph', 'isolation') === 'auto', 'a released header must not stay a stacking context (the menu would open under the card)');
        }
        t.visible('#dd >>> [part=menu]', 'the open menu');
    },
};
