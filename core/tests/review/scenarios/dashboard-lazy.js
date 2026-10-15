// Widgets start when they scroll near (#1295): in a scrolled region the cards below the fold sit in their reserved space (no widget has run), and scrolling brings the next one in
// with nothing around it moving. Plain page element with a counting load(), like dashboard-page's own examples.
const DASH = '#box pk-dashboard-page';
const CARD = key => `${DASH} >>> pk-card[data-key="${key}"]`;
const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export default {
    name: 'dashboard-lazy',
    elements: ['dashboard-page', 'card', 'stat'],
    html: '<div id="box"></div>',
    setup(frame) {
        const el = frame.ownerDocument.createElement('pk-dashboard-page');
        el.config = { widgets: KEYS.map(key => ({ key, label: `Widget ${key.toUpperCase()}`, size: 'lg' })) };
        el.load = async key => ({ value: key.toUpperCase().repeat(2), subtext: 'loaded when near' });
        const box = frame.querySelector('#box');
        box.style.blockSize = '30rem'; box.style.overflow = 'auto';
        box.append(el);
    },
    steps: [{ wait: 600 }, { shot: 'top' }, { scroll: '#box', to: 5000 }, { wait: 600 }, { shot: 'bottom' }],
    expect(t) {
        t.visible(CARD('a'), 'the first card');
        if (t.shot === 'top') {
            t.exists(`${CARD('a')} pk-stat`);
            t.absent(`${CARD('h')} pk-stat`);
            t.ok(t.attr(CARD('h'), 'data-state') !== 'ready', 'the last card has not started while it is far below the fold');
            t.ok(t.rect(CARD('h'))?.height > 100, 'a card below the fold still keeps its reserved height');
        }
        if (t.shot === 'bottom') {
            t.exists(`${CARD('h')} pk-stat`);
            t.ok(t.attr(CARD('h'), 'data-state') === 'ready', 'scrolling to the last card started it');
        }
    },
};
