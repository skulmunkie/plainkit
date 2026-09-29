// pk-tabs overflow="menu" (issue 659): tabs that do not fit collapse behind a trailing "..." button; its menu lists them, opening it does not
// wrap the strip onto more rows, and picking a hidden tab from the menu selects it and moves the visible strip's focus onto it. Modeled on the
// real case that prompted the issue: mountToolDock's eight-tab strip (Console, Logs, Logging, Performance, Quality, Inspector, Theme, Layout builder).
const NAMES = ['Console', 'Logs', 'Logging', 'Performance', 'Quality', 'Inspector', 'Theme', 'Layout builder'];
const TABS = NAMES.map((n, i) => `<pk-tab id="m${i}" value="m${i}">${n}</pk-tab>`).join('');

export default {
    name: 'tabs-overflow-menu',
    elements: ['tabs'],
    issue: [659],
    html: `<div class="u-p-1r-1p25r"><pk-tabs id="t1" overflow="menu" value="m0">${TABS}</pk-tabs></div>`,
    steps: [
        { resize: 400 },
        { shot: 'rest' },
        { focus: '#t1 >>> [part="more-trigger"]' }, { key: 'Enter' }, { wait: 200 }, { shot: 'menu-open' },
        { key: 'ArrowDown' }, { wait: 'settle' }, { key: 'Enter' }, { wait: 200 }, { shot: 'menu-pick' },
    ],
    expect(t) {
        const list = t.rect('#t1 >>> [part="list"]');
        const trigger = '#t1 >>> [part="more-trigger"]';
        if (t.shot === 'rest') {
            t.ok(t.attr('#m0', 'selected') !== null, 'the first tab starts selected');
            t.visible('#m0', 'the first (selected) tab');
            t.visible(trigger, 'the overflow trigger');
            // One row: the strip never grows taller because tabs wrapped onto more rows.
            t.ok(list.height < 60, `the strip is one row (height ${Math.round(list.height)}px), overflow="menu" must not wrap`);
            t.within(trigger, '#t1 >>> [part="list"]');
        }
        if (t.shot === 'menu-open') {
            t.ok(t.attr(trigger, 'aria-expanded') === 'true', 'the trigger announces the menu is open');
            t.visible('#t1 >>> [part="more"] pk-menu-item', 'the menu lists the hidden tabs');
        }
        if (t.shot === 'menu-pick') {
            t.ok(t.attr(trigger, 'aria-expanded') === 'false', 'choosing a menu item closes the menu');
            t.ok(t.attr('#m0', 'selected') === null, 'picking a hidden tab from the menu moves the selection off the first tab');
        }
    },
};
