// Browser cases for pk-icon, pk-local-time and the pk-field label-action slot. Same shape as cases.js.
export const iconTimeCases = [
    ['icon: the use href is an absolute URL to the SDK sprite and the symbol exists there; a label makes it an image, none hides it', async t => {
        const el = await t.mount('<pk-icon name="search"></pk-icon>');
        const use = el.part('use');
        const href = use.getAttribute('href');
        t.ok(/^https?:\/\/.+\/icons\.svg#search$/.test(href), `href is ${href}`);
        const res = await fetch(href.split('#')[0]);
        t.ok(res.ok, 'the sprite is served at that URL');
        t.ok((await res.text()).includes('id="search"'), 'the sprite holds the symbol');
        t.eq(el.internals.ariaHidden, 'true', 'without a label it is hidden from assistive tech');
        const box = el.getBoundingClientRect();
        t.ok(box.width > 0 && Math.abs(box.width - box.height) < 0.5, 'it is square and sized');
        el.label = 'Search'; el.name = 'settings'; await t.settle();
        t.eq(el.internals.role, 'img'); t.eq(el.internals.ariaLabel, 'Search'); t.ok(!el.internals.ariaHidden, 'a label removes aria-hidden');
        t.ok(use.getAttribute('href').endsWith('icons.svg#settings'), 'a new name repoints the use');
        el.size = 'xl'; await t.settle();
        t.ok(el.getBoundingClientRect().width > box.width * 1.5, 'the xl step is larger');
    }],

    ['local time: writes the instant in the given locale and zone inside a time element, falls back to the slot, and relative reads as words', async t => {
        const el = await t.mount('<pk-local-time datetime="2026-09-19T14:30:00Z" locale="en-US" time-zone="UTC" format="date"></pk-local-time>');
        const time = el.part('time');
        t.eq(time.localName, 'time'); t.eq(time.getAttribute('datetime'), '2026-09-19T14:30:00Z', 'the machine value stays');
        t.eq(el.part('text').textContent, 'Sep 19, 2026');
        el.format = 'time'; await t.settle(); t.ok(/^2:30\sPM$/.test(el.part('text').textContent), el.part('text').textContent);
        el.locale = 'de-DE'; el.timeZone = 'Europe/Berlin'; await t.settle(); t.eq(el.part('text').textContent, '16:30', 'locale and zone re-render');
        const own = await t.mount('<pk-local-time datetime="2026-09-19T14:30:00Z" format="datetime"></pk-local-time>');
        t.eq(own.part('text').textContent, new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-09-19T14:30:00Z')), 'no locale: the reader default');
        const bad = await t.mount('<pk-local-time datetime="soon">Soon</pk-local-time>');
        t.eq(bad.part('text').textContent, ''); t.ok(!bad.shadowRoot.querySelector('slot').hidden, 'invalid: the slot text shows');
        const rel = await t.mount(`<pk-local-time format="relative" locale="en" datetime="${new Date(Date.now() - 3 * 3600e3).toISOString()}"></pk-local-time>`);
        t.eq(rel.part('text').textContent, '3 hours ago'); t.ok(rel.part('time').title.length > 8, 'the title holds the full date');
    }],

    ['field: a label-action slot sits beside the label, shows even without a label, and clicking it does not focus the control', async t => {
        const f = await t.mount('<pk-field label="Release date"><pk-button slot="label-action" variant="ghost" size="mini">Reset</pk-button><input value="x"></pk-field>'); await t.settle();
        const btn = f.querySelector('pk-button'), lab = f.part('label');
        const slot = f.shadowRoot.querySelector('slot[name="label-action"]');
        t.ok(slot.assignedElements().includes(btn), 'the button is assigned to the slot');
        const a = btn.getBoundingClientRect(), l = lab.getBoundingClientRect();
        t.ok(a.left >= l.left && a.top < l.bottom && a.bottom > l.top, 'it sits on the label row');
        const input = f.querySelector('input'); let focused = 0; input.focus = () => { focused++; };
        btn.click(); await t.settle(); t.eq(focused, 0, 'the control was not focused by the action');
        lab.click(); await t.settle(); t.eq(focused, 1, 'the label itself still focuses it');
        const bare = await t.mount('<pk-field><pk-button slot="label-action" size="mini">Reset</pk-button><input></pk-field>'); await t.settle();
        t.ok(!bare.part('label').hidden, 'the label row shows for an action alone');
    }],
    ['icon: a sprite that cannot be loaded warns once, draws nothing and leaves every icon box and icon button the size it had (#111)', async t => {
        const html = '<pk-icon id="i" name="search"></pk-icon><pk-icon id="x" name="search" size="xl"></pk-icon><pk-button id="b" icon icon-name="plus" label="Add"></pk-button><pk-button id="c" icon-name="plus">Add</pk-button>';
        const sizes = host => ['i', 'x', 'b', 'c'].map(id => { const r = host.querySelector('#' + id).getBoundingClientRect(); return `${id}:${r.width}x${r.height}`; });
        const ok = t.stage(html); await t.load(ok); await t.settle();
        const before = sizes(ok);
        const meta = document.createElement('meta'); meta.name = 'pk-icons'; meta.content = '/no-such-icons.svg'; document.head.append(meta);
        try {
            const { addLogSink } = await import('../../js/log.js');
            const m = await import('../../js/icon-sprite.js?pk-missing-sprite'); // a fresh module reads the missing sprite once
            const seen = []; addLogSink(e => { if (e.scope === 'icon-sprite' && e.level === 'warn') seen.push(e.message); });
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            m.drawIcon(use, 'plus', () => {}); m.drawIcon(use, 'search', () => {});
            await new Promise(r => setTimeout(r, 400));
            t.eq(seen.length, 1, 'one warning only: ' + seen.length);
            t.ok(/plainkit.icons/.test(seen[0] || '') && /no-such-icons.svg/.test(seen[0] || ''), 'it names the address and the package');
            const bad = t.stage(html); await t.load(bad); await t.settle();
            t.ok(bad.querySelector('#i').part('use').getAttribute('href').includes('no-such-icons.svg#search'), 'the icons now point at the missing sprite');
            t.eq(sizes(bad).join(), before.join(), 'every icon and icon button has the same size without the sprite');
        } finally { meta.remove(); }
    }],
];
