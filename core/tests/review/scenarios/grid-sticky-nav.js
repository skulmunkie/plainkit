// pk-grid sticky-first (#1675): a section nav beside a long article stays in view after its scrolling area scrolls 800px; RTL puts it on the right.
export default {
    name: 'grid-sticky-nav',
    issue: [1675],
    elements: ['grid'],
    viewports: ['desktop'],
    html: `<div id="box"><pk-grid id="g" ratio="1:3" sticky-first><pk-card id="nav" heading="On this page"><pk-text>Overview</pk-text><pk-text>Details</pk-text><pk-text>History</pk-text></pk-card><pk-card heading="Article">${'<pk-text>A paragraph of the long article that scrolls past the nav while the nav stays in view.</pk-text>'.repeat(60)}</pk-card></pk-grid></div>`,
    setup(frame) {
        const box = frame.querySelector('#box');
        box.style.blockSize = '30rem'; box.style.overflow = 'auto';
    },
    steps: [
        { wait: 'settle' }, { scroll: '#box', to: 800 }, { shot: 'scrolled' },
        { set: '#g', attr: 'dir', value: 'rtl' }, { shot: 'rtl' },
    ],
    expect(t) {
        t.within('#nav', '#box');
    },
};
