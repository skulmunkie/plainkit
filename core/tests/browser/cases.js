// The element tests that need a real browser: shadow DOM, slots, events, keyboard, forms, ElementInternals, strict CSP, theme inheritance.
import { dataDisplayCases } from './cases-data-display.js';
// Each case is [name, async (t) => void]. t offers mount(html), settle(), key(el, key), and plain assertions.

import { overlaysCases } from './cases-overlays.js';

export const cases = [
    ['declarative shadow DOM gives a first paint and upgrades in place', async t => {
        const host = t.stage('');
        host.setHTMLUnsafe('<pk-card heading="Server rendered"><template shadowrootmode="open"><div part="card">server</div></template>Body</pk-card>');
        const el = host.firstElementChild;
        t.ok(el.shadowRoot, 'shadow root exists before the element is upgraded');
        t.eq(el.shadowRoot.textContent, 'server');
        await t.load(host);
        t.ok(el.shadowRoot.querySelector('[part="title"]'), 'the template replaced the server markup');
        t.eq(el.shadowRoot.querySelector('[part="title"]').textContent, 'Server rendered');
    }],

    ['a not-yet-defined element is hidden, then shown once its module loads (no flash of unstyled content)', async t => {
        const host = t.stage('<pk-switch>Alerts</pk-switch>');
        const el = host.firstElementChild;
        if (customElements.get('pk-switch')) return t.ok(true, 'already defined by an earlier case');
        t.eq(getComputedStyle(el).visibility, 'hidden', 'hidden while undefined');
        await t.load(host);
        t.eq(getComputedStyle(el).visibility, 'visible', 'visible when defined');
    }],

    ['every registered tag is defined by the loader', async t => {
        const registry = (await import('../../elements/registry.js')).default;
        const host = t.stage(Object.keys(registry).map(tag => `<${tag}></${tag}>`).join(''));
        await t.load(host);
        for (const tag of Object.keys(registry)) t.ok(customElements.get(tag), `${tag} is defined`);
    }],

    // ---- pk-button
    ['button: defaults, attribute to property, property to attribute, invalid enum falls back', async t => {
        const b = await t.mount('<pk-button>Save</pk-button>');
        t.eq(b.variant, 'primary'); t.eq(b.size, 'md'); t.eq(b.type, 'button'); t.eq(b.disabled, false);
        b.setAttribute('variant', 'ghost'); t.eq(b.variant, 'ghost');
        b.variant = 'warn'; t.eq(b.getAttribute('variant'), 'warn');
        b.variant = 'nonsense'; t.eq(b.variant, 'primary', 'invalid value coerces to the default');
        b.disabled = true; await t.settle(); t.ok(b.hasAttribute('disabled')); t.ok(b.part('control').disabled, 'inner button is disabled');
        b.removeAttribute('disabled'); await t.settle(); t.eq(b.disabled, false); t.ok(!b.part('control').disabled);
    }],

    ['button: label, start and end slots are projected; the control part is exposed', async t => {
        const b = await t.mount('<pk-button><span slot="start">+</span>Add<span slot="end">></span></pk-button>');
        t.eq(b.slotted('start').length, 1); t.eq(b.slotted('end').length, 1); t.ok(b.shadowRoot.querySelector('slot:not([name])').assignedNodes().length >= 1, 'default slot receives the label');
        t.ok(b.shadowRoot.querySelector('[part="control"]'));
    }],

    ['button: focus goes to the inner button (delegatesFocus) and a disabled button swallows clicks', async t => {
        const b = await t.mount('<pk-button>Go</pk-button>');
        b.focus();
        t.eq(b.shadowRoot.activeElement, b.part('control'), 'inner button has focus');
        let clicks = 0; b.addEventListener('click', () => clicks++);
        b.disabled = true; await t.settle(); b.part('control').click(); b.click();
        t.eq(clicks, 0, 'no click reaches a disabled button');
    }],

    ['button: type=submit submits and type=reset resets the surrounding form', async t => {
        const host = t.stage('<form><input name="q" value="a"><pk-button type="submit">Go</pk-button><pk-button type="reset" variant="ghost">Clear</pk-button></form>');
        await t.load(host);
        const form = host.firstElementChild; const [go, clear] = form.querySelectorAll('pk-button');
        let submitted = 0; form.addEventListener('submit', e => { e.preventDefault(); submitted++; });
        go.part('control').click(); t.eq(submitted, 1, 'submit event fired');
        form.q.value = 'changed'; clear.part('control').click(); t.eq(form.q.value, 'a', 'form was reset');
    }],

    // ---- pk-card
    ['card: heading is bound, aria-level follows level, header hides when empty', async t => {
        const c = await t.mount('<pk-card heading="Shipping">Body</pk-card>');
        const title = c.part('title');
        t.eq(title.textContent, 'Shipping'); t.eq(title.getAttribute('aria-level'), '2'); t.ok(!c.part('header').hidden);
        c.heading = 'Billing'; c.level = 3; await t.settle();
        t.eq(title.textContent, 'Billing'); t.eq(title.getAttribute('aria-level'), '3');
        c.heading = ''; await t.settle(); t.ok(c.part('header').hidden, 'no heading and no actions hides the header');
    }],

    ['card: an actions child reveals the header and a footer child reveals the footer (slotchange)', async t => {
        const c = await t.mount('<pk-card>Body</pk-card>');
        t.ok(c.part('header').hidden); t.ok(c.part('footer').hidden);
        c.insertAdjacentHTML('beforeend', '<button slot="actions">Edit</button><small slot="footer">Saved</small>');
        await t.settle(); await t.settle();
        t.ok(!c.part('header').hidden, 'header shows'); t.ok(!c.part('footer').hidden, 'footer shows');
    }],

    ['card: tone reflects and the ::part hook and custom properties style the shadow tree', async t => {
        const host = t.stage('<pk-card heading="x" tone="error">Body</pk-card>');
        await t.load(host);
        const c = host.firstElementChild;
        t.eq(c.tone, 'error');
        const before = getComputedStyle(c.part('card')).borderTopColor;
        c.setAttribute('tone', 'default'); await t.settle();
        t.ok(getComputedStyle(c.part('card')).borderTopColor !== before, 'the error border colour changes when the tone does');
    }],

    // ---- pk-tabs
    ['tabs: first tab is selected, panels follow, roving tabindex and aria wiring are set', async t => {
        const el = await t.mount(t.tabsHtml());
        const [a, b, c] = el.querySelectorAll('pk-tab'); const [pa, pb] = el.querySelectorAll('pk-tab-panel');
        t.eq(el.value, 'a'); t.ok(a.selected && !b.selected);
        t.eq(a.tabIndex, 0); t.eq(b.tabIndex, -1);
        t.eq(getComputedStyle(pa).display, 'block'); t.eq(getComputedStyle(pb).display, 'none');
        t.eq(a.getAttribute('aria-controls'), pa.id, 'aria-controls resolves in the light DOM');
        t.eq(pa.getAttribute('aria-labelledby'), a.id);
        t.eq(a.internals.role, 'tab'); t.eq(a.internals.ariaSelected, 'true'); t.eq(b.internals.ariaSelected, 'false'); t.eq(pa.internals.role, 'tabpanel');
        t.ok(c.disabled);
    }],

    ['tabs: clicking selects, emits a composed cancelable event, and preventDefault keeps the old tab', async t => {
        const el = await t.mount(t.tabsHtml());
        const [, b] = el.querySelectorAll('pk-tab');
        let seen = null; document.addEventListener('pk-tab-change', e => { seen = e.detail; }, { once: true });
        b.click(); await t.settle();
        t.eq(el.value, 'b'); t.eq(seen?.value, 'b'); t.eq(seen?.previous, 'a', 'event crossed the shadow boundary to document');
        el.addEventListener('pk-tab-change', e => e.preventDefault(), { once: true });
        el.querySelector('pk-tab').click(); await t.settle();
        t.eq(el.value, 'b', 'cancelled change leaves the selection alone');
    }],

    ['tabs: arrow keys, Home and End move focus and select; disabled tabs are skipped', async t => {
        const el = await t.mount(t.tabsHtml());
        const [a, b] = el.querySelectorAll('pk-tab');
        a.focus(); t.key(a, 'ArrowRight'); await t.settle();
        t.eq(el.value, 'b'); t.eq(document.activeElement, b);
        t.key(b, 'ArrowRight'); await t.settle();
        t.eq(el.value, 'a', 'wraps past the disabled third tab');
        t.key(a, 'End'); await t.settle(); t.eq(el.value, 'b', 'End goes to the last enabled tab');
        t.key(b, 'Home'); await t.settle(); t.eq(el.value, 'a');
    }],

    ['tabs: manual activation moves focus but selects only on click', async t => {
        const el = await t.mount(t.tabsHtml('manual'));
        const [a, b] = el.querySelectorAll('pk-tab');
        a.focus(); t.key(a, 'ArrowRight'); await t.settle();
        t.eq(el.value, 'a'); t.eq(b.tabIndex, 0, 'focus target moves'); t.eq(document.activeElement, b);
        b.click(); await t.settle(); t.eq(el.value, 'b');
    }],

    // ---- pk-switch (form-associated)
    ['switch: toggles, emits change, and reflects checked', async t => {
        const s = await t.mount('<pk-switch>Alerts</pk-switch>');
        let detail = null; let typed = null; s.addEventListener('change', e => { detail = e.detail; }); s.addEventListener('pk-change', e => { typed = e.detail; });
        t.eq(s.part('control').getAttribute('aria-checked'), 'false');
        s.part('control').click(); await t.settle();
        t.eq(s.checked, true); t.ok(s.hasAttribute('checked')); t.eq(detail?.checked, true); t.eq(typed?.checked, true, 'the typed pk-change event carries the same detail'); t.eq(s.part('control').getAttribute('aria-checked'), 'true');
    }],

    ['switch: takes part in the form (value when on, absent when off), resets and follows a disabled fieldset', async t => {
        const host = t.stage('<form><fieldset><pk-switch name="n" value="yes" checked>N</pk-switch></fieldset></form>');
        await t.load(host);
        const form = host.firstElementChild; const s = form.querySelector('pk-switch'); const fs = form.querySelector('fieldset');
        t.eq(new FormData(form).get('n'), 'yes', 'submits its value while on');
        s.part('control').click(); await t.settle();
        t.eq(new FormData(form).get('n'), null, 'absent while off');
        form.reset(); await t.settle();
        t.eq(s.checked, true, 'reset restores the initial state');
        fs.disabled = true; await t.settle();
        t.eq(s.disabled, true, 'a disabled fieldset disables it'); t.ok(s.part('control').disabled);
    }],

    ['switch: exposes the switch role to assistive technology and is named by its label', async t => {
        const s = await t.mount('<pk-switch>Email alerts</pk-switch>');
        const inner = s.part('control');
        t.eq(inner.getAttribute('role'), 'switch'); t.eq(s.part('label').querySelector('slot').assignedNodes().map(n => n.textContent).join('').trim(), 'Email alerts', 'the label slot is inside the button, so it names it');
    }],

    // ---- cross-cutting
    ['strict CSP: no element carries a style attribute or style element, and styles are adopted sheets', async t => {
        const host = t.stage('<pk-button>a</pk-button><pk-card heading="b">c</pk-card><pk-switch>d</pk-switch>' + t.tabsHtml());
        await t.load(host); await t.settle();
        for (const el of host.querySelectorAll('*')) {
            if (!el.localName.startsWith('pk-')) continue;
            t.eq(el.getAttribute('style'), null, `${el.localName} has no style attribute`);
            t.eq(el.shadowRoot.querySelectorAll('style,[style]').length, 0, `${el.localName} shadow tree has no inline style`);
            t.ok(el.shadowRoot.adoptedStyleSheets.length >= 2, `${el.localName} adopts constructable sheets`);
        }
    }],

    ['theme: tokens inherit into shadow roots, so a data-theme ancestor restyles the component', async t => {
        const host = t.stage('<div data-theme="dark" class="tb-scope"><pk-button>x</pk-button></div><div data-theme="light" class="tb-scope"><pk-button>x</pk-button></div>');
        await t.load(host);
        const [dark, light] = host.querySelectorAll('pk-button');
        const probe = (theme) => { const d = document.createElement('div'); d.setAttribute('data-theme', theme); d.className = 'tb-probe'; host.append(d); const v = getComputedStyle(d).getPropertyValue('--color-accent').trim(); d.remove(); return v; };
        const bg = el => getComputedStyle(el.part('control')).backgroundColor;
        t.ok(bg(dark) !== '' && bg(light) !== '', 'both resolve a background');
        const colour = (theme) => { const d = document.createElement('div'); d.setAttribute('data-theme', theme); host.append(d); d.style.backgroundColor = 'var(--color-accent-fill)'; const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
        t.eq(bg(dark), colour('dark'), 'dark button uses the dark accent fill');
        t.eq(bg(light), colour('light'), 'light button uses the light accent fill');
        t.ok(probe('dark') !== undefined);
    }],

    ['props set before the element is defined are upgraded, not lost', async t => {
        const host = t.stage('');
        const card = document.createElement('pk-card');
        card.heading = 'Early'; card.level = 4;
        host.append(card);
        await t.load(host); await t.settle();
        t.eq(card.part('title').textContent, 'Early'); t.eq(card.level, 4);
    }],

    ['tabs: count badge, close button event, only=phone hidden on desktop, trailing slot', async t => {
        const el = await t.mount('<pk-tabs value="a"><pk-tab value="a" count="12">Pending</pk-tab><pk-tab value="b" closable>Draft</pk-tab><pk-tab value="c" only="phone">Phone</pk-tab><span slot="trailing">hint</span></pk-tabs>');
        const [a, b, c] = el.querySelectorAll('pk-tab');
        t.eq(a.part('count').textContent, '(12)'); t.ok(getComputedStyle(a.part('close')).display === 'none' || a.part('close').hidden, 'no close button on a plain tab');
        t.ok(!b.part('close').hidden, 'closable tab shows its close button');
        let closed = null; document.addEventListener('pk-tab-close', e => { closed = e.detail.value; }, { once: true });
        b.part('close').click(); await t.settle();
        t.eq(closed, 'b'); t.eq(el.value, 'a', 'closing does not select the tab');
        t.eq(getComputedStyle(c).display !== 'none', innerWidth <= 640, 'phone-only tab follows the viewport');
        t.ok(el.shadowRoot.querySelector('slot[name=trailing]').assignedElements().length === 1, 'trailing content is slotted after the tabs');
    }],

    ['tabs: none-active selects nothing and every choice raises the event; scroll mode fades the edge with more tabs', async t => {
        const el = await t.mount('<pk-tabs none-active><pk-tab value="a">A</pk-tab><pk-tab value="b">B</pk-tab></pk-tabs>');
        const [a] = el.querySelectorAll('pk-tab');
        t.ok(![...el.querySelectorAll('pk-tab')].some(x => x.selected), 'no tab is selected'); t.eq(a.tabIndex, 0);
        let n = 0; el.addEventListener('pk-tab-change', () => n++);
        a.click(); a.click(); await t.settle(); t.eq(n, 2, 'clicking the same tab twice raises twice');
        const s = await t.mount('<pk-tabs scroll value="a">' + Array.from({ length: 30 }, (_, i) => `<pk-tab value="${i}">Tab number ${i}</pk-tab>`).join('') + '</pk-tabs>');
        await t.settle(); await t.settle();
        const list = s.part('list');
        t.eq(getComputedStyle(list).flexWrap, 'nowrap'); t.eq(list.getAttribute('data-fade'), 'end', 'the fade is on the side that has more tabs');
        list.scrollLeft = 200; list.dispatchEvent(new Event('scroll')); t.ok(['both', 'end'].includes(list.getAttribute('data-fade')));
    }],

    ['mounting 200 buttons is fast enough to be unnoticeable', async t => {
        const host = t.stage(Array.from({ length: 200 }, (_, i) => `<pk-button>${i}</pk-button>`).join(''));
        const start = performance.now();
        await t.load(host); await t.settle();
        const ms = performance.now() - start;
        t.ok(ms < 1500, `took ${Math.round(ms)}ms`);
    }],

    ...overlaysCases,
    ...dataDisplayCases,
];
import { formCases } from './cases-forms.js';
cases.push(...formCases);
import { toolCases } from './cases-tools.js';
cases.push(...toolCases);
import { headerCases } from './cases-headers.js'; cases.push(...headerCases);
import { layoutCases } from './cases-layout.js'; cases.push(...layoutCases);
import { iconTimeCases } from './cases-icon-time.js'; cases.push(...iconTimeCases);
import { workspaceCases } from './cases-workspace.js'; cases.push(...workspaceCases);
