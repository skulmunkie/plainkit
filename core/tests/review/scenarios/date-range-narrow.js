// pk-date-range-picker in a card at phone width (issue 1717): both date controls show their whole value and picker icon inside the card.
export default {
    name: 'date-range-narrow',
    issue: [1717, 1982],
    elements: ['date-range-picker'],
    html: '<div id="stage"><div class="u-p-1r-1p25r"><pk-date-range-picker id="q" calendar label="Window" start="2026-09-08" end="2026-09-17"></pk-date-range-picker></div><pk-card heading="Period"><pk-date-range-picker id="p" calendar label="Period" start="2026-09-08" end="2026-09-17" presets="month,quarter"></pk-date-range-picker></pk-card></div>',
    steps: [{ wait: 600 }, { shot: 'resting' }, { resize: 390 }, { wait: 300 }, { shot: 'w390' }, { resize: 375 }, { wait: 300 }, { shot: 'w375' }, { resize: 360 }, { wait: 300 }, { shot: 'w360' }, { resize: 340 }, { wait: 300 }, { shot: 'w340' }, ...[345, 348, 351, 354, 357].flatMap(w => [{ resize: w }, { wait: 200 }, { shot: 'w' + w }])],
    expect(t) {
        t.visible('#p', 'the picker');
        t.within('#p >>> [part="end"]', '#p');
        t.within('#p >>> [part="start"]', '#p');
        // A native date field clips its year inside its own shadow tree, so scrollWidth cannot see it: the control must keep room for MM/DD/YYYY at the phone's 16px text and its picker icon (about 130px; asked for 130px).
        for (const part of ['start', 'end']) for (const id of ['p', 'q']) t.atLeast(`#${id} >>> [part="${part}"]`, 'width', 130);
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
