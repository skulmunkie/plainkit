// pk-date-range-picker in a card at phone width (issue 1717): both date controls show their whole value and picker icon inside the card.
export default {
    name: 'date-range-narrow',
    issue: [1717],
    elements: ['date-range-picker'],
    html: '<div id="stage"><pk-card heading="Period"><pk-date-range-picker id="p" calendar label="Period" start="2026-09-08" end="2026-09-17" presets="month,quarter"></pk-date-range-picker></pk-card></div>',
    steps: [{ wait: 600 }, { shot: 'resting' }],
    expect(t) {
        t.visible('#p', 'the picker');
        t.within('#p >>> [part="end"]', '#p');
        t.within('#p >>> [part="start"]', '#p');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
