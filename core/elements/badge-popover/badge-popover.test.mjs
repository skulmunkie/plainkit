// Contract checks for pk-badge-popover: template, stylesheet and meta describe the same disclosure pattern. Behaviour is covered by the browser cases (issue 300).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const html = read('./badge-popover.html'), css = read('./badge-popover.css'), js = read('./badge-popover.js'), meta = JSON.parse(read('./badge-popover.meta.json'));

test('the pill is a native button that controls a dialog panel in the same shadow root', () => {
    assert.match(html, /<button part="trigger" type="button" id="t" aria-haspopup="dialog" aria-controls="p" aria-expanded="false">/);
    assert.match(html, /<div part="panel" id="p" role="dialog" tabindex="-1">/);
    for (const s of ['details', 'actions']) assert.match(html, new RegExp(`<slot name="${s}">`));
    assert.ok(!/\sstyle=|\son\w+=/.test(html), 'no inline style or handlers');
});

test('open is two-way with both commit events, close is cancelable and names a reason', () => {
    const open = meta.props.find(p => p.name === 'open');
    assert.deepEqual(open.commit, ['pk-open', 'pk-close']);
    assert.deepEqual(meta.events.find(e => e.name === 'pk-close').detail, { reason: 'string' });
    assert.match(js, /if \(!this\.emit\('pk-close', \{ reason \}\)\) return;/);
});

test('it reuses the positioning helpers and returns focus to the pill unless the close came from outside', () => {
    assert.match(js, /import \{ place, autoUpdate, onOutside \} from '\.\.\/\.\.\/js\/positioning\.js'/);
    assert.match(js, /reason !== 'outside' && reason !== 'blur'\) this\.part\('trigger'\)\.focus/);
});

test('on a phone the panel spans the viewport inside the gutters and the pill has a touch-sized hit area; tokens only', () => {
    const phone = css.slice(css.indexOf('@media (--phone)'));
    assert.match(phone, /width: calc\(100vw - 2 \* var\(--space-4\)\)/);
    assert.doesNotMatch(css, /!important/);
    assert.match(js, /placement: phone \? 'bottom'/);
    assert.match(phone, /var\(--touch-target\)/);
    assert.doesNotMatch(css.replace(/var\([^)]*\)/g, ''), /#[0-9a-f]{3,8}\b|rgba?\(/i);
    assert.match(css, /prefers-reduced-motion/);
});
