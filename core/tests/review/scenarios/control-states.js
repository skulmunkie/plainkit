// Hover and keyboard focus for a button, a link and an input: the ring must show and must not be cut off (a still example cannot show either).
const seen = {};
export default {
    name: 'control-states',
    elements: ['button', 'input'],
    html: `<div class="u-p-1r-1p25r"><pk-stack>
<pk-button id="save">Save</pk-button>
<p>Read the <a id="link" href="#terms">terms of service</a> first.</p>
<pk-input id="name" label="Name" placeholder="Ada Lovelace"></pk-input>
</pk-stack></div>`,
    steps: [
        { shot: 'rest' },
        { hover: '#save >>> [part=control]' }, { wait: 300 }, { shot: 'button-hover' },
        { focus: '#save >>> [part=control]' }, { shot: 'button-focus' },
        { hover: '#link' }, { wait: 300 }, { shot: 'link-hover' },
        { focus: '#link' }, { shot: 'link-focus' },
        { focus: '#name >>> input' }, { shot: 'input-focus' },
    ],
    expect(t) {
        const key = `${t.viewport.name}/${t.theme}`;
        const btn = '#save >>> [part=control]';
        if (t.shot === 'rest') seen[key] = { bg: t.style(btn, 'background-color'), color: t.style('#link', 'color') };
        if (t.shot === 'button-hover') t.ok(t.style(btn, 'background-color') !== seen[key].bg, `the button does not change on hover (background stays ${seen[key].bg})`);
        if (t.shot === 'button-focus') { t.ringVisible(btn); t.ringUnclipped(btn); }
        if (t.shot === 'link-hover') t.ok(t.style('#link', 'text-decoration-line') !== 'none' || t.style('#link', 'color') !== seen[key].color, 'the link does not change on hover (no underline, same colour)');
        if (t.shot === 'link-focus') { t.ringVisible('#link'); t.ringUnclipped('#link'); }
        if (t.shot === 'input-focus') { t.ringVisible('#name >>> .box'); t.ringUnclipped('#name >>> .box'); }
        t.inViewport('#name');
    },
};
