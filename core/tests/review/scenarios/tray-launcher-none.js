// pk-tray launcher-variant="none": no floating launcher; the tray opens from a control the page already has (data-toggle), and that control reports the state (#1941).
// Real mouse clicks, so the order of the real events is the one a reader causes.
const EXT = '#ext';
const BOX = '#tray >>> [part=panel]';

export default {
    name: 'tray-launcher-none',
    issue: [1941],
    elements: ['tray', 'button'],
    html: `<div id="wrap" class="u-p-1r-1p25r">
<div id="bar"><pk-button id="ext" variant="ghost" data-toggle="#tray">Help</pk-button></div>
<h1>Orders</h1>
<p>The page keeps its corner free: the tray opens from the Help button above.</p>
<pk-tray id="tray" label="Help" launcher-label="Help" launcher-variant="none" hotkey="Alt+H" edge="end" size="small"><p>Help content.</p></pk-tray>
</div>`,
    steps: [
        { shot: 'closed' },
        { click: EXT }, { wait: 500 }, { shot: 'open' },
        { click: '#tray >>> [part=close]' }, { wait: 500 }, { shot: 'closed-again' },
    ],
    expect(t) {
        t.ok(!t.shown('#tray >>> [part=launcher]'), 'no launcher is drawn');
        const open = t.shot === 'open';
        t.ok(t.attr(EXT, 'aria-expanded') === String(open), 'the external control reports aria-expanded=' + open + ' after a real click (got ' + t.attr(EXT, 'aria-expanded') + ')');
        t.ok(t.attr(EXT, 'aria-controls') === 'tray', 'it points at the tray with aria-controls (got ' + t.attr(EXT, 'aria-controls') + ')');
        t.ok((t.attr(EXT, 'title') ?? '').includes('Alt+H'), 'its title carries the hotkey (got ' + t.attr(EXT, 'title') + ')');
        if (open) t.ok(t.shown(BOX) && t.rect(BOX).width > 0, 'the tray panel is open after the click');
    },
};
