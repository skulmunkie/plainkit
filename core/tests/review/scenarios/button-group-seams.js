// pk-button-group and pk-split-button: neighbours abut (no shared-border overlap) and the keyboard focus ring of a middle button stays visible and unclipped,
// horizontal, vertical and right to left (issue 1259).
const MID = '#h pk-button:nth-child(2) >>> [part=control]';
const VMID = '#v pk-button:nth-child(2) >>> [part=control]';

export default {
    name: 'button-group-seams',
    issue: [1259],
    elements: ['button-group', 'button', 'split-button'],
    html: `<div id="wrap" class="u-p-1r-1p25r">
<pk-button-group id="h" label="Range"><pk-button variant="ghost">Day</pk-button><pk-button variant="ghost" pressed>Week</pk-button><pk-button variant="ghost">Month</pk-button></pk-button-group>
<pk-button-group id="v" orientation="vertical" label="Order"><pk-button variant="ghost">Top</pk-button><pk-button variant="ghost">Middle</pk-button><pk-button variant="ghost">Bottom</pk-button></pk-button-group>
<pk-split-button id="s" label="Save">Save</pk-split-button>
</div>`,
    steps: [
        { shot: 'rest' },
        { focus: '#h pk-button:nth-child(2)' }, { shot: 'focus-horizontal' },
        { focus: '#v pk-button:nth-child(2)' }, { shot: 'focus-vertical' },
        { set: '#wrap', attr: 'dir', value: 'rtl' }, { focus: '#h pk-button:nth-child(2)' }, { shot: 'focus-rtl' },
    ],
    expect(t) {
        if (t.shot === 'focus-horizontal') { t.ringVisible(MID); t.ringUnclipped(MID); }
        if (t.shot === 'focus-vertical') { t.ringVisible(VMID); t.ringUnclipped(VMID); }
        if (t.shot === 'focus-rtl') { t.ringVisible(MID); t.ringUnclipped(MID); }
    },
};
