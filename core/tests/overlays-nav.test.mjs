// Group checks for the overlays, feedback and navigation elements, beyond the build's own API validation: motion is respectable, no
// !important, phone targets are tokenised, events carry a typed detail, and every element has the Blazor mapping a wrapper generator needs.
// Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GROUP = ['tooltip', 'popover', 'dropdown', 'menu-item', 'context-menu', 'select-menu', 'drawer', 'toast', 'toast-stack', 'command-palette',
    'breadcrumb', 'stepper', 'step', 'toc', 'scroll-progress', 'back-to-top', 'skip-link', 'pager', 'alert', 'loading-overlay', 'dialog',
    'lightbox', 'side-nav', 'nav-item', 'navbar', 'app-shell'];
const read = (folder, ext) => fs.readFileSync(path.join(root, 'elements', folder, `${folder}.${ext}`), 'utf8').replace(/\r\n/g, '\n');
const css = folder => read(folder, 'css').replace(/\/\*[\s\S]*?\*\//g, '');
const meta = folder => JSON.parse(read(folder, 'meta.json'));

test('no stylesheet in the group uses !important or carries a literal colour', () => {
    for (const f of GROUP) {
        assert.ok(!/!important/.test(css(f)), `${f}: !important`);
        assert.ok(!/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(css(f)), `${f}: literal colour`);
    }
});

test('anything that animates or transitions has a reduced-motion rule', () => {
    for (const f of GROUP) if (/animation:|transition:/.test(css(f))) assert.match(css(f), /prefers-reduced-motion/, f);
});

test('interactive parts are touch sized on a phone by token, never by a literal', () => {
    for (const f of ['toast', 'alert', 'drawer', 'dialog', 'back-to-top', 'navbar', 'pager', 'breadcrumb', 'popover', 'menu-item', 'nav-item']) assert.match(css(f), /--touch-target/, f);
});

test('every event carries a typed detail (or null) so a wrapper generator can make an event-args class', () => {
    for (const f of GROUP) for (const e of meta(f).events) {
        assert.ok(e.detail === null || (typeof e.detail === 'object' && Object.values(e.detail).every(t => typeof t === 'string')), `${f}.${e.name}`);
    }
});

test('every element has a Blazor mapping: each param is a prop, a slot, an event, a css property or explained as wrapper-only', () => {
    for (const f of GROUP) {
        const m = meta(f);
        assert.ok(m.blazor.component && m.blazor.params.length > 0, `${f} blazor`);
        for (const p of m.blazor.params) {
            assert.ok(['prop', 'slot', 'event', 'cssProperty', 'wrapper'].includes(p.map), `${f}.${p.name} map`);
            assert.ok(p.type, `${f}.${p.name} type`);
            if (p.map === 'prop') assert.ok(m.props.some(x => x.name === p.prop), `${f}.${p.name} names a prop`);
            if (p.map === 'slot') assert.ok(m.slots.some(x => x.name === p.slot), `${f}.${p.name} names a slot`);
            if (p.map === 'event') assert.ok(m.events.some(x => x.name === p.event), `${f}.${p.name} names an event`);
            if (p.map === 'wrapper') assert.ok(p.note, `${f}.${p.name} explains why it stays in the wrapper`);
        }
    }
});

test('the app\'s existing components keep their Blazor names and parameters', () => {
    const named = { dialog: ['Modal', ['IsOpen', 'Title', 'HeaderContent', 'ChildContent', 'FooterContent', 'OnClose', 'MaxWidthPx']], drawer: ['FlyoutPanel', ['IsOpen', 'Title', 'ChildContent', 'FooterContent', 'ActionsContent', 'OnClose', 'Wide', 'Persistent']],
        alert: ['Notice', ['Kind', 'Title', 'Message', 'Dismissible', 'OnDismiss']], tooltip: ['InfoTip', ['Text', 'Placement', 'HoverDelay', 'TooltipContent']], 'app-shell': ['AppShell', ['SidebarContent', 'HeaderContent', 'BodyContent', 'FooterContent']], 'side-nav': ['NavMenu', ['Collapsed', 'Filterable', 'Persist']] };
    for (const [f, [component, params]] of Object.entries(named)) {
        const m = meta(f);
        assert.equal(m.blazor.component, component);
        for (const p of params) assert.ok(m.blazor.params.some(x => x.name === p), `${f} keeps ${p}`);
    }
});

test('two-way parameters name the change event that drives them', () => {
    for (const f of GROUP) for (const p of meta(f).blazor.params.filter(x => x.bind)) {
        assert.ok(meta(f).events.some(e => e.name === p.bind.event), `${f}.${p.name} binds to ${p.bind.event}`);
    }
});

test('the overlay elements reflect open, so Blazor can drive them, and clean up the top layer on disconnect', () => {
    for (const f of ['dialog', 'drawer', 'command-palette', 'lightbox', 'popover', 'dropdown', 'select-menu']) {
        const open = meta(f).props.find(p => p.name === 'open');
        assert.ok(open && open.reflect && open.type === 'boolean', `${f} reflects open`);
    }
    for (const f of ['dialog', 'drawer', 'command-palette', 'lightbox']) assert.match(read(f, 'js'), /disconnected\(\)[^}]*close\(\)/, `${f} closes its dialog on disconnect`);
});
