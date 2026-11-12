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
    ['app-shell: a footer whose every slotted child is hidden at the current breakpoint is not drawn (#1936)', async t => {
        const host = t.stage('<pk-app-shell id="s"><span slot="footer" data-show-above="phone">Wide only</span><span slot="footer" data-hide-above="phone">Phone only</span><div>Body</div></pk-app-shell><pk-app-shell id="v"><span slot="footer">Always</span><div>Body</div></pk-app-shell>');
        await t.load(host); await t.settle(); await wait(120);
        const s = host.querySelector('#s'), v = host.querySelector('#v'), kids = [...s.querySelectorAll('[slot=footer]')];
        t.ok(kids.some(k => getComputedStyle(k).display !== 'none'), 'one child is visible at this width');
        t.eq(getComputedStyle(part(s, 'footer')).display, 'flex', 'a footer with a visible child is drawn');
        for (const k of kids) k.style.display = 'none';
        s.requestUpdate(); await wait(120);
        t.eq(getComputedStyle(part(s, 'footer')).display, 'none', 'every child hidden: the footer bar is display none');
        t.eq(box(s, 'footer').height, 0, 'and 0 high');
        t.eq(getComputedStyle(part(v, 'footer')).display, 'flex', 'the control footer with a visible child is still drawn');
    }],
    ['button: busy with an icon draws one icon slot, the spinner, never the icon beside it (#1945)', async t => {
        const host = t.stage('<pk-button id="a" icon-name="plus">Add</pk-button><pk-button id="b"><svg slot="start" viewBox="0 0 24 24" width="16" height="16"><path d="M5 12h14"/></svg>Add</pk-button><pk-button id="c">Add</pk-button>');
        await t.load(host); await t.settle(); await wait(80);
        const shown = (b, sel) => { const e = b.shadowRoot.querySelector(sel) ?? b.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; };
        const icons = b => ['.ic', '[part="spinner"]'].filter(s => shown(b, s)).length + (shown(b, '[slot="start"]') ? 1 : 0);
        const a = host.querySelector('#a'), b = host.querySelector('#b'), c = host.querySelector('#c');
        t.eq(icons(a), 1, 'idle icon-name button: one icon'); t.eq(icons(b), 1, 'idle start-slot button: one icon');
        for (const x of [a, b, c]) x.busy = true;
        await wait(120);
        t.eq(icons(a), 1, 'busy icon-name button: the spinner only'); t.ok(shown(a, '[part="spinner"]'), 'and it is the spinner');
        t.eq(icons(b), 1, 'busy start-slot button: the spinner only'); t.eq(icons(c), 1, 'busy plain button: the spinner');
    }],
];
