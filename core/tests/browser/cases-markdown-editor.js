// Browser cases for pk-markdown-editor (#1486, spec docs/superpowers/specs/2026-10-16-rich-text-editor-design.md section 9): selection kept on wrap and unwrap, lists, the link
// refusal, one-step undo, the roving toolbar and its names, the hostile preview, the value round trip with form reset and FormData, IME, layout at 375 and 1000 px, and
// disabled / readonly / maxlength. Same shape as cases.js: [name, async (t) => void].
const JS = 'java' + 'script:'; // a script address, built so the source scan does not flag this file
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 200; i++) { const v = fn(); if (v) return v; await wait(30); } throw new Error(`timed out waiting for ${what}`); };
const mount = async (t, attrs = '', width = '') => {
    const host = t.stage(`<div><pk-markdown-editor label="Body" ${attrs}></pk-markdown-editor></div>`);
    if (width) host.firstElementChild.style.width = width;
    await t.load(host);
    const el = host.querySelector('pk-markdown-editor'); await t.load(el.shadowRoot); await t.load(el.part('commands'));
    el.$t = el.part('control').part('control');
    el.sel = (a, b = a) => { el.$t.focus(); el.$t.setSelectionRange(a, b); };
    el.cmd = id => el.part('commands').querySelector(`[data-cmd="${id}"]`);
    el.clickCmd = async id => { const before = el.value; el.cmd(id).click(); await until(() => el.value !== before, `${id} to change ${JSON.stringify(before)}`); await t.settle(); };
    return el;
};
const inner = b => b.part('control');
const deepActive = () => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };
const key = (target, k, init = {}) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init }); target.dispatchEvent(e); return e; };

export const markdownEditorCases = [
    ['markdown-editor: bold and italic wrap the selection, keep it, and unwrap on a second click', async t => {
        const el = await mount(t, 'value="a word here"');
        el.sel(2, 6);
        await el.clickCmd('bold');
        t.eq(el.value, 'a **word** here'); t.eq(el.$t.value.slice(el.$t.selectionStart, el.$t.selectionEnd), 'word', 'the selection still covers the word');
        await el.clickCmd('bold');
        t.eq(el.value, 'a word here'); t.eq(el.$t.value.slice(el.$t.selectionStart, el.$t.selectionEnd), 'word');
        await el.clickCmd('italic');
        t.eq(el.value, 'a *word* here'); t.eq(el.$t.value.slice(el.$t.selectionStart, el.$t.selectionEnd), 'word');
        await el.clickCmd('italic');
        t.eq(el.value, 'a word here');
    }],
    ['markdown-editor: Ctrl+B in the textarea wraps the selection; the default of Ctrl+B on an input outside the editor is not prevented', async t => {
        const host = t.stage('<div><input id="o"><pk-markdown-editor label="Body" value="make bold"></pk-markdown-editor></div>'); await t.load(host);
        const el = host.querySelector('pk-markdown-editor'); await t.load(el.shadowRoot);
        const ta = el.part('control').part('control'); ta.focus(); ta.setSelectionRange(5, 9);
        const e = key(ta, 'b', { ctrlKey: true });
        t.ok(e.defaultPrevented, 'Ctrl+B is handled in the textarea');
        await until(() => el.value === 'make **bold**', 'Ctrl+B to wrap');
        t.ok(!key(host.querySelector('#o'), 'b', { ctrlKey: true }).defaultPrevented, 'a sibling input keeps its Ctrl+B default');
        ta.setSelectionRange(0, 4); key(ta, 'i', { metaKey: true });
        await until(() => el.value === '*make* **bold**', 'Cmd+I to wrap');
    }],
    ['markdown-editor: lists prefix every selected line, a second click removes them, numbering is 1. 2. 3.', async t => {
        const el = await mount(t, 'value="one\ntwo\nthree"');
        el.sel(0, el.$t.value.length);
        await el.clickCmd('ul'); t.eq(el.value, '- one\n- two\n- three');
        await el.clickCmd('ul'); t.eq(el.value, 'one\ntwo\nthree');
        el.sel(0, el.$t.value.length);
        await el.clickCmd('ol'); t.eq(el.value, '1. one\n2. two\n3. three');
        await el.clickCmd('ol'); t.eq(el.value, 'one\ntwo\nthree');
    }],
    ['markdown-editor: the link command wraps the selection; a script address is refused inline and the value is unchanged', async t => {
        const el = await mount(t, 'value="see site now"');
        el.sel(4, 8); el.cmd('link').click();
        await until(() => !el.part('linkbar').hidden, 'the link row');
        const url = el.part('url'); url.value = JS + 'alert(1)'; el.part('link-ok').click();
        await until(() => !el.part('error').hidden, 'an inline error');
        t.ok(el.part('error').textContent.length > 0, 'the error says why');
        t.eq(el.value, 'see site now', 'a refused address changes nothing');
        url.value = 'https://x.test'; el.part('link-ok').click();
        await until(() => el.value !== 'see site now', 'the link');
        t.eq(el.value, 'see [site](https://x.test) now'); t.ok(el.part('linkbar').hidden, 'the row closes after a good address');
    }],
    ['markdown-editor: one undo step restores the text before a toolbar command', async t => {
        const el = await mount(t, 'value="undo me"');
        el.sel(0, 4); await el.clickCmd('bold');
        t.eq(el.value, '**undo** me');
        el.$t.focus(); document.execCommand('undo'); await t.settle();
        t.eq(el.$t.value, 'undo me', 'a single undo reverts the command'); t.eq(el.value, 'undo me', 'and the value follows');
    }],
    ['markdown-editor: the toolbar is named, has one tab stop, the arrow keys rove, and every control has a name', async t => {
        const el = await mount(t);
        const bar = el.part('commands');
        t.eq(bar.getAttribute('role'), 'toolbar'); t.ok(bar.getAttribute('aria-label'), 'the toolbar has a name');
        const stops = () => [...bar.children].filter(b => inner(b).getAttribute('tabindex') === '0');
        t.eq(stops().length, 1, 'one Tab stop in the toolbar');
        for (const b of bar.children) t.ok(inner(b).getAttribute('aria-label')?.trim(), `${b.dataset.cmd} has an accessible name`);
        t.ok(el.$t.getAttribute('aria-label') === 'Body', 'the textarea is named');
        inner(bar.children[0]).focus();
        key(inner(bar.children[0]), 'ArrowRight'); await t.settle();
        t.eq(deepActive(), inner(bar.children[1]), 'ArrowRight moves to the next button'); t.eq(stops()[0], bar.children[1], 'and the tab stop follows');
        key(deepActive(), 'End'); await t.settle(); t.eq(deepActive(), inner(bar.lastElementChild), 'End goes to the last');
        key(deepActive(), 'Home'); await t.settle(); t.eq(deepActive(), inner(bar.children[0]), 'Home goes to the first');
        key(deepActive(), 'ArrowLeft'); await t.settle(); t.eq(deepActive(), inner(bar.lastElementChild), 'ArrowLeft wraps');
        key(deepActive(), 'Escape'); await t.settle(); t.eq(deepActive(), el.$t, 'Escape returns to the textarea');
    }],
    ['markdown-editor: the preview of hostile text has no script, no script-scheme link, no on* or style attribute, and keeps the bold', async t => {
        const el = await mount(t);
        el.value = '<script>alert(1)</script> **b** [x](' + JS + '1) <img src=x onerror=alert(1)>'; await t.settle();
        el.mode = 'preview';
        const pv = el.part('preview');
        await until(() => !pv.hidden && pv.querySelector('strong'), 'the preview');
        t.ok(!pv.querySelector('script'), 'no script element'); t.ok(!pv.querySelector('img'), 'no image');
        t.ok(![...pv.querySelectorAll('a')].some(a => (a.getAttribute('href') ?? '').trim().toLowerCase().startsWith(JS)), 'no script-scheme href');
        t.ok(![...pv.querySelectorAll('*')].some(n => [...n.attributes].some(a => /^on|^style$/i.test(a.name))), 'no on* or style attribute');
        t.ok(pv.textContent.includes('<script>alert(1)</script>'), 'raw HTML is shown as text');
        t.ok(el.part('write').hidden, 'the writing pane is hidden in preview'); t.eq(pv.getAttribute('role'), 'region');
    }],
    ['markdown-editor: the value round-trips (CRLF, trailing spaces, emoji, RTL), a form reset restores it, FormData carries it under name', async t => {
        const host = t.stage('<form><pk-markdown-editor name="body" label="Body" value="start"></pk-markdown-editor></form>'); await t.load(host);
        const el = host.querySelector('pk-markdown-editor'); await t.load(el.shadowRoot);
        const odd = 'line one  \r\nline two \u{1F600}\r\nשלום  ';
        el.value = odd; await t.settle();
        t.eq(el.value, odd, 'read back identical'); t.eq(new FormData(host.firstElementChild).get('body'), odd, 'the form carries the exact string');
        t.eq(el.part('control').part('control').value, odd.replace(/\r\n/g, '\n'), 'the textarea shows it');
        el.part('control').part('control').value = 'typed'; el.part('control').part('control').dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle();
        t.eq(new FormData(host.firstElementChild).get('body'), 'typed');
        host.firstElementChild.reset(); await t.settle();
        t.eq(el.value, 'start', 'reset restores the initial value'); t.eq(el.part('control').part('control').value, 'start');
    }],
    ['markdown-editor: nothing is applied during IME composition', async t => {
        const el = await mount(t, 'value="compose"');
        el.sel(0, 7);
        el.$t.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, composed: true }));
        const e = key(el.$t, 'b', { ctrlKey: true, isComposing: true });
        el.cmd('bold').click(); await wait(80); await t.settle();
        t.ok(!e.defaultPrevented, 'the shortcut is left alone while composing'); t.eq(el.$t.value, 'compose', 'the textarea is unchanged'); t.eq(el.value, 'compose');
        el.$t.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, composed: true }));
        key(el.$t, 'b', { ctrlKey: true });
        await until(() => el.value === '**compose**', 'the shortcut after composition');
    }],
    ['markdown-editor: at 375 px the toolbar and tabs fit with no horizontal overflow and every control is at least 24 px', async t => {
        const el = await mount(t, 'value="# Title"', '375px');
        const box = el.getBoundingClientRect();
        t.ok(el.scrollWidth <= el.clientWidth + 1, 'no horizontal overflow inside the field'); t.ok(box.width <= 376, 'the field is as wide as its container');
        const sRect = el.parentElement.getBoundingClientRect();
        for (const n of [...el.part('commands').children, ...el.part('tabs').children]) {
            const r = n.getBoundingClientRect();
            t.ok(r.left >= sRect.left - 1 && r.right <= sRect.right + 1, `${n.dataset.cmd ?? n.textContent.trim()} sits inside the field`);
            t.ok(r.width >= 24 && r.height >= 24, `${n.dataset.cmd ?? n.textContent.trim()} is at least 24px`);
        }
    }],
    ['markdown-editor: the split layout puts write and preview side by side at equal height, and the preview scrolls on its own', async t => {
        const el = await mount(t, `layout="split" rows="4" value="${Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n\n').replace(/\n/g, '&#10;')}"`, '1000px');
        await until(() => el.hasAttribute('data-split') && el.part('preview').firstChild, 'split and a rendered preview');
        const w = el.part('write').getBoundingClientRect(), p = el.part('preview').getBoundingClientRect();
        t.ok(!el.part('write').hidden && !el.part('preview').hidden, 'both panes show');
        t.ok(p.left >= w.right - 1, 'the preview sits beside the writing pane'); t.ok(Math.abs(w.height - p.height) <= 1, 'equal height');
        t.ok(el.part('preview').scrollHeight > el.part('preview').clientHeight + 10, 'the preview has more than it shows'); el.part('preview').scrollTop = 40;
        t.eq(el.$t.scrollTop, 0, 'the textarea does not scroll with the preview'); t.ok(el.part('preview').scrollTop > 0, 'the preview scrolled');
        el.parentElement.style.width = '375px'; await until(() => !el.hasAttribute('data-split'), 'the tabs to return when narrow');
        t.ok(!el.part('tabs').hidden || getComputedStyle(el.part('tabs')).display !== 'none', 'the tabs are back');
    }],
    ['markdown-editor: Enter continues a bullet or numbered list, and Enter on an empty item leaves the list', async t => {
        const el = await mount(t, 'value="- one"');
        el.sel(0); await until(() => el.$m, 'the commands chunk');
        const at = async (v, p = v.length) => { el.value = v; await t.settle(); el.sel(p); };
        await at('- one'); key(el.$t, 'Enter'); await until(() => el.value === '- one\n- ', 'a new bullet');
        t.eq(el.$t.selectionStart, 8, 'the caret sits after the new marker');
        key(el.$t, 'Enter'); await until(() => el.value === '- one\n', 'the empty item removed');
        await at('1. a\n2. b'); key(el.$t, 'Enter'); await until(() => el.value === '1. a\n2. b\n3. ', 'the next number');
        await at('plain'); const e = key(el.$t, 'Enter'); t.ok(!e.defaultPrevented, 'Enter outside a list is left to the browser');
    }],
    ['markdown-editor: pasting a URL over a selection makes it a link; with no selection, or for text, the paste is left alone', async t => {
        const el = await mount(t, 'value="see site now"');
        el.sel(0); await until(() => el.$m, 'the commands chunk');
        const paste = txt => { const dt = new DataTransfer(); dt.setData('text/plain', txt); const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }); el.$t.dispatchEvent(e); return e; };
        el.sel(4, 8); t.ok(paste('https://x.test').defaultPrevented, 'the paste is taken');
        await until(() => el.value === 'see [site](https://x.test) now', 'the link'); t.eq(el.$t.value.slice(el.$t.selectionStart, el.$t.selectionEnd), 'site');
        el.sel(0, 3); t.ok(!paste('not a url').defaultPrevented, 'plain text pastes normally');
        el.sel(0); t.ok(!paste('https://x.test').defaultPrevented, 'no selection: a normal paste');
        el.sel(0, 3); t.ok(!paste(JS + 'alert(1)').defaultPrevented, 'a script address is never made a link');
    }],
    ['markdown-editor: the heading and quote buttons prefix and toggle back, and the full toolbar fits at 375 px', async t => {
        const el = await mount(t, 'toolbar="bold italic heading quote ul ol link" value="word"', '375px');
        el.sel(0, 4);
        await el.clickCmd('heading'); t.eq(el.value, '## word');
        await el.clickCmd('heading'); t.eq(el.value, 'word');
        await el.clickCmd('quote'); t.eq(el.value, '> word');
        await el.clickCmd('quote'); t.eq(el.value, 'word');
        const sRect = el.parentElement.getBoundingClientRect();
        t.ok(el.scrollWidth <= el.clientWidth + 1, 'no horizontal overflow');
        for (const b of el.part('commands').children) { const r = b.getBoundingClientRect(); t.ok(r.left >= sRect.left - 1 && r.right <= sRect.right + 1 && r.width >= 24 && r.height >= 24, `${b.dataset.cmd} fits and is at least 24px`); }
    }],
    ['markdown-editor: disabled blocks commands and the tab order, readonly allows the preview only, maxlength stops a command that would exceed it', async t => {
        const d = await mount(t, 'disabled value="hello"');
        d.sel(0, 5); d.cmd('bold').click(); key(d.$t, 'b', { ctrlKey: true }); await wait(80);
        t.eq(d.value, 'hello', 'disabled: nothing runs'); t.ok(d.$t.disabled, 'the textarea is disabled');
        t.ok([...d.part('commands').children].every(b => b.disabled && inner(b).getAttribute('tabindex') !== '0'), 'the toolbar is out of the tab order');
        const r = await mount(t, 'readonly value="hello"');
        r.sel(0, 5); r.cmd('bold').click(); key(r.$t, 'b', { ctrlKey: true }); await wait(80);
        t.eq(r.value, 'hello', 'readonly: commands do nothing'); r.mode = 'preview';
        await until(() => r.part('preview').querySelector('p'), 'a readonly preview'); t.eq(r.part('preview').textContent, 'hello');
        const m = await mount(t, 'maxlength="6" value="hello"');
        m.sel(0, 5); m.cmd('bold').click(); await wait(80);
        t.eq(m.value, 'hello', 'a command that would pass maxlength is a no-op');
    }],
    ['markdown: pk-markdown draws the text with DOM nodes only, shows raw HTML as text and refuses a script address (#1673)', async t => {
        const host = t.stage(`<div><pk-markdown markdown="## Title&#10;&#10;<b id=x>raw</b> **bold** [bad](${JS}alert(1)) [ok](https://example.test)"></pk-markdown></div>`); await t.load(host);
        const el = host.querySelector('pk-markdown');
        const c = await until(() => el.part('content').querySelector('strong') && el.part('content'), 'the markdown to draw');
        t.eq(c.querySelector('h2')?.textContent, 'Title'); t.ok(!c.querySelector('b'), 'raw HTML is not parsed'); t.ok(c.textContent.includes('<b id=x>raw</b>'), 'raw HTML shows as text');
        t.eq([...c.querySelectorAll('a')].map(a => a.getAttribute('href')).join(), 'https://example.test', 'only the safe link is a link');
        el.markdown = 'changed'; await until(() => c.textContent === 'changed', 'a new value to redraw');
    }],
    ['markdown: a relative link click raises pk-link-click, interceptLinks cancels it, absolute and anchor links are left alone (#1673)', async t => {
        const host = t.stage('<div><pk-markdown markdown="[a](guide/intro) [b](https://example.test) [c](#top)"></pk-markdown></div>'); await t.load(host);
        const el = host.querySelector('pk-markdown');
        await until(() => el.part('content').querySelector('a'), 'the links to draw');
        const seen = [], prevented = []; el.addEventListener('pk-link-click', e => seen.push(e.detail.href));
        el.addEventListener('click', e => { prevented.push(e.defaultPrevented); e.preventDefault(); }); // after the element's own handler: records its verdict, and keeps the test page from navigating
        const click = n => el.part('content').querySelectorAll('a')[n].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
        click(0); click(1); click(2);
        t.eq(seen.join(), 'guide/intro', 'only the relative link is reported');
        t.eq(prevented.join(), 'false,false,false', 'a plain relative link is left to the page');
        el.interceptLinks = true; await t.settle(); click(0);
        t.eq(prevented.at(-1), true, 'interceptLinks cancels the navigation');
    }],
    ['markdown (#1700): under rtl at 375 px a wide table and a long code line stay inside the host on both sides and the content does not scroll sideways', async t => {
        const host = t.stage('<div dir="rtl"><pk-markdown></pk-markdown></div>'); host.firstElementChild.style.inlineSize = '375px';
        const md = host.querySelector('pk-markdown');
        md.markdown = ['| a | b | c | d | e | f | g | h |','|---|---|---|---|---|---|---|---|','| aaaaaaaaaaaaaaaa | aaaaaaaaaaaaaaaa | aaaaaaaaaaaaaaaa | aaaaaaaaaaaaaaaa | aaaaaaaaaaaaaaaa | aaaaaaaaaaaaaaaa | aaaaaaaaaaaaaaaa | aaaaaaaaaaaaaaaa |','','```','x'.repeat(200),'```','','Averyveryverylongwordwithoutanybreaks'+'y'.repeat(120)].join('\n');
        await t.load(md); await t.load(md.shadowRoot); await t.settle();
        const box = md.getBoundingClientRect(), content = md.shadowRoot.querySelector('[part=content]');
        t.ok(content.scrollWidth <= content.clientWidth + 1, `the content scrolls sideways (scrollWidth ${content.scrollWidth}, clientWidth ${content.clientWidth})`);
        for (const n of content.children) { const r = n.getBoundingClientRect(); if (!r.width) continue; t.ok(r.left >= box.left - 1 && r.right <= box.right + 1, `<${n.localName}> spans ${Math.round(r.left)}..${Math.round(r.right)}, outside the host ${Math.round(box.left)}..${Math.round(box.right)}`); }
    }],
];
