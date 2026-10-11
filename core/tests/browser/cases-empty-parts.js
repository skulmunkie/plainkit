// Browser cases for the empty actions/footer/links parts of alert, dialog, drawer, toast and tooltip (issue 1150). Same contract as cases.js: [name, async (t) => void].
const wait = ms => new Promise(r => setTimeout(r, ms));
const part = (el, p) => el.shadowRoot.querySelector(`[part="${p}"]`);
const box = (el, p) => part(el, p).getBoundingClientRect();

// One empty and one filled instance: the empty part reserves no space and draws nothing; the filled one is laid out.
const pair = (name, tag, attrs, partName, slot, open) => [`${name}: with nothing in the ${slot} slot the ${partName} part reserves no space; with content it is laid out`, async t => {
    const host = t.stage(`<${tag} id="e" ${attrs}>Body</${tag}><${tag} id="f" ${attrs}>Body<button slot="${slot}">Go</button></${tag}>`);
    await t.load(host); await t.settle(); await wait(80);
    const e = host.querySelector('#e'), f = host.querySelector('#f');
    open?.(e); open?.(f); await wait(120);
    t.eq(getComputedStyle(part(e, partName)).display, 'none', `the empty ${partName} part is display none`);
    t.eq(box(e, partName).height, 0, `the empty ${partName} part is 0 high`);
    t.eq(box(e, partName).width, 0, `the empty ${partName} part is 0 wide`);
    t.ok(box(f, partName).height > 0 && box(f, partName).width > 0, `the filled ${partName} part is laid out (${box(f, partName).width} x ${box(f, partName).height})`);
}];
const modal = e => { e.open = true; };

export const emptyPartsCases = [
    pair('alert', 'pk-alert', '', 'actions', 'action'),
    pair('toast', 'pk-toast', 'duration="0"', 'actions', 'action'),
    pair('dialog', 'pk-dialog', 'heading="T"', 'footer', 'footer', modal),
    pair('drawer', 'pk-drawer', 'heading="T"', 'footer', 'footer', modal),
    pair('drawer', 'pk-drawer', 'heading="T"', 'actions', 'actions', modal),
    pair('tooltip', 'pk-tooltip', 'text="Tip"', 'links', 'links', e => e.show()),
];
