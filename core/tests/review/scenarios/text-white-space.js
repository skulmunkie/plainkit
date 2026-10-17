// pk-text white-space (issue 1538): a note that carries its own line breaks keeps them, stays inside its column and does not collapse.
export default {
    name: 'text-white-space',
    issue: [1538],
    elements: ['text'],
    html: `<div id="stage" class="u-p-1r-1p25r"><pk-text id="n" white-space="pre-wrap">First line of the note.
  Indented second line.

Fourth line after a blank one, long enough that it has to wrap inside the column on a phone.</pk-text></div>`,
    steps: [{ shot: 'pre-wrap' }],
    expect(t) {
        t.visible('#n', 'the note');
        t.within('#n', '#stage');
        t.ok(t.metric('#n', 'clientHeight') > 3 * 16, 'the note collapsed: its line breaks were not kept');
        t.ok(t.metric('#n', 'scrollWidth') <= t.metric('#n', 'clientWidth') + 1, 'the note overflows its column sideways');
    },
};
