// pk-settings-page section nav (#334): four sections, so the nav is automatic. Desktop: a sticky list beside the cards that marks the section in view; phone: no list, pk-detail-layout's
// tab strip over the cards instead. States: resting, an unsaved edit with the sticky Save bar, a section chosen from the nav, scrolled 800px, and right-to-left.
const SP = '#sp';
const NAV = `${SP} >>> [part=nav]`;
const TABS = `${SP} >>> pk-detail-layout >>> [part=tabs]`;
const BAR = `${SP} >>> [part=bar]`;
const CARD = n => `${SP} >>> pk-card:nth-of-type(${n})`;
const fields = (p, n) => Array.from({ length: n }, (_, i) => ({ key: `${p}${i}`, type: 'text', label: `${p} setting ${i + 1}`, hint: i === 0 ? `What ${p} does` : undefined }));

export default {
    name: 'settings-nav',
    issue: [334],
    elements: ['settings-page', 'detail-layout', 'nav-item'],
    html: '<div id="wrap" class="rv-page"><div id="box"><pk-settings-page id="sp"></pk-settings-page></div></div>',
    setup(frame) {
        Object.assign(frame.querySelector('#box').style, { blockSize: '80vh', overflow: 'auto' }); // the scroller a shell body is
        frame.querySelector(SP).config = {
            heading: 'Account settings',
            sections: ['Profile', 'Notifications', 'Billing', 'Security'].map(heading => ({ heading, fields: fields(heading.toLowerCase(), 6) })),
        };
    },
    steps: [
        { wait: 'settle' }, { shot: 'resting' },
        { focus: `${SP} >>> pk-input` }, { type: 'x' }, { key: 'Tab' }, { wait: 200 }, { shot: 'dirty' },
        { click: `${NAV} pk-nav-item:nth-child(3)`, on: ['desktop'] }, { wait: 300 }, { shot: 'billing', on: ['desktop'] },
        { scroll: '#box', to: 800 }, { wait: 300 }, { shot: 'scrolled' },
        { set: '#wrap', attr: 'dir', value: 'rtl' }, { scroll: '#box', to: 0 }, { wait: 300 }, { shot: 'rtl' },
    ],
    expect(t) {
        t.exists(CARD(4));
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.viewport.name === 'phone') {
            t.hidden(NAV, 'the section nav on a phone');
            t.visible(TABS, 'the section tab strip');
            if (t.shot !== 'scrolled') t.noOverlap(TABS, CARD(1), 2); // scrolled, the strip is sticky and overlays the cards on purpose
            return;
        }
        t.visible(NAV, 'the section nav');
        t.inViewport(NAV);
        t.noOverlap(NAV, CARD(1));
        if (t.shot !== 'billing' && t.shot !== 'scrolled' && t.shot !== 'dirty') t.ok(Math.abs(t.rect(NAV).y - t.rect(CARD(1)).y) <= 2, 'the nav top lines up with the first card');
        if (t.shot === 'rtl') t.ok(t.rect(NAV).x > t.rect(CARD(1)).x, 'in right-to-left the nav is on the right of the cards');
        else t.ok(t.rect(NAV).right <= t.rect(CARD(1)).x + 1, 'the nav is left of the cards');
        if (t.shot !== 'resting' && t.shot !== 'rtl') { t.visible(BAR, 'the sticky Save bar'); t.noOverlap(BAR, NAV); }
    },
};
