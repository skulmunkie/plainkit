// pk-tray launcher-variant="icon": a bare circle around one icon, transparent while the tray is closed and filled while it is open, at the corner and moved by the inset hooks.
const L = '#tray >>> [part=launcher]';
const C = '#tray >>> [part=launcher] >>> [part=control]';

export default {
    name: 'tray-icon-launcher',
    issue: [1908],
    elements: ['tray', 'button'],
    html: `<div id="wrap" class="u-p-1r-1p25r">
<h1>Orders</h1>
<p>The help launcher floats in the corner and keeps the page behind it usable.</p>
<pk-tray id="tray" label="Help" launcher-label="Help" launcher-variant="icon" edge="end" size="small"><pk-icon slot="launcher" name="search"></pk-icon><p>Help content.</p></pk-tray>
</div>`,
    steps: [
        { shot: 'closed' },
        { click: L }, { wait: 500 }, { shot: 'open' },
        { click: '#tray >>> [part=close]' }, { shot: 'closed-again' },
    ],
    expect(t) {
        if (t.shot === 'open') t.ok(t.attr(C, 'aria-pressed') === 'true', 'after a real click the launcher button is pressed (aria-pressed ' + t.attr(C, 'aria-pressed') + ') (#1924)');
        if (t.shot === 'closed-again') t.ok(t.attr(C, 'aria-pressed') === 'false', 'after closing, the launcher button is not pressed (#1924)');
        const v = t.viewport;
        t.visible(L, 'the launcher'); t.inViewport(L);
        const c = t.rect(C);
        if (c) t.ok(c.width <= 48 && c.height <= 48, `the launcher is a small circle (${Math.round(c.width)}x${Math.round(c.height)}; a phone keeps its 44px touch target)`);
        const l = t.rect(L);
        if (l) t.ok(Math.abs(v.width - (l.x + l.width) - 12) <= 6 && Math.abs(v.height - (l.y + l.height) - 12) <= 6, 'it sits one small step from the corner');
    },
};
