// URL handling from the security audit (issue #106): an address that comes from data must never become a script. The hostile forms are the ones a URL parser
// forgives: case, leading and inner whitespace, control characters, tabs and newlines inside the scheme. Run: node --test core/tests/safe-url.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemeOf, safeLink, safeHref } from '../js/safe-url.js';
import { safeLink as menuSafeLink } from '../js/menu-logic.js';
import { linkAttrs } from '../elements/button/button.js';
import { frameUrl } from '../elements/gallery/gallery.js';
import { safeSrc as gallerySrc } from '../elements/image-gallery/image-gallery.js';
import { safeSrc as lightboxSrc } from '../elements/lightbox/lightbox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const JS = 'java' + 'script:alert(1)'; // assembled: the scanner (rightly) flags the literal address in source
const HOSTILE = [
    JS, JS.toUpperCase(), ` ${JS}`, `\t${JS}`, `\n\r ${JS}`, 'java\nscript:alert(1)', 'java\tscript:alert(1)', 'java\rscript:alert(1)',
    'jav\x00ascript:alert(1)', `\x01${JS}`, `  \u{2028}${JS}`, 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>',
    'DATA:text/html;base64,PHNjcmlwdD4=', 'blob:https://evil.example/x', 'file:///etc/passwd', 'ftp://example.com/x', 'view-source:https://example.com',
];

test('the scheme is read the way the browser reads it', () => {
    assert.equal(schemeOf('JaVa\nScRiPt:x'), 'javascript');
    assert.equal(schemeOf(' \t https://a.example'), 'https');
    for (const relative of ['/a/b', 'a/b', './a:b', '../a', '#frag', '?q=a:b', '', null, undefined, '//host/path', '/a:b']) assert.equal(schemeOf(relative), null, String(relative));
});

test('safeLink and safeHref refuse every hostile scheme and keep every ordinary address as it was written', () => {
    for (const bad of HOSTILE) {
        assert.equal(safeLink(bad), null, `safeLink accepted ${JSON.stringify(bad)}`);
        assert.equal(safeHref(bad), null, `safeHref accepted ${JSON.stringify(bad)}`);
        assert.equal(menuSafeLink(bad), null, `menu safeLink accepted ${JSON.stringify(bad)}`);
    }
    for (const ok of ['/a/b', 'a/b?x=1#y', '#top', '?page=2', 'https://example.com/a', 'HTTP://example.com', '//cdn.example/x']) {
        assert.equal(safeLink(ok), ok); assert.equal(safeHref(ok), ok);
    }
    for (const link of ['mailto:a@example.com', 'tel:+15551234', 'sms:+15551234']) { assert.equal(safeHref(link), link); assert.equal(safeLink(link), null, 'a menu row does not navigate to a mail or phone link'); }
    for (const nothing of ['', '   ', null, undefined, 5, {}]) { assert.equal(safeLink(nothing), null); assert.equal(safeHref(nothing), null); }
});

test('pk-button: a hostile href never reaches the anchor', () => {
    const base = { target: '', rel: '', download: null, disabled: false, busy: false, label: '' };
    for (const bad of HOSTILE) assert.equal(linkAttrs({ ...base, href: bad }).href, null, JSON.stringify(bad));
    assert.equal(linkAttrs({ ...base, href: '/ok' }).href, '/ok');
    assert.equal(linkAttrs({ ...base, href: 'mailto:a@example.com' }).href, 'mailto:a@example.com');
});

test('pk-gallery: a hostile src (an iframe would run it in the host page) falls back to the built-in gallery page', () => {
    const fallback = frameUrl({});
    for (const bad of HOSTILE) assert.equal(frameUrl({ src: bad }), fallback, JSON.stringify(bad));
    assert.match(frameUrl({ src: 'https://gallery.example/embed.html' }), /^https:\/\/gallery\.example\/embed\.html\?/);
});

test('pk-image-gallery and pk-lightbox show only same-site, http(s) and raster data sources', () => {
    for (const fn of [gallerySrc, lightboxSrc]) {
        for (const bad of HOSTILE) assert.equal(fn(bad), null, JSON.stringify(bad));
        assert.equal(fn('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
        assert.equal(fn('data:image/svg+xml,<svg onload=alert(1)>'), null, 'svg data can carry script');
        assert.equal(fn('/img/a.png'), '/img/a.png');
    }
});

test('no element sets an href from a property without going through js/safe-url.js', () => {
    const offenders = [];
    for (const dir of fs.readdirSync(path.join(root, 'elements'))) {
        const file = path.join(root, 'elements', dir, `${dir}.js`);
        if (!fs.existsSync(file)) continue;
        const text = fs.readFileSync(file, 'utf8');
        if (/setAttribute\(\s*['"]href['"]\s*,\s*(?:this\.|p\.)/.test(text)) offenders.push(`${dir}: sets href from a property`);
        if (/setAttribute\(\s*['"]href['"]\s*,\s*(?:href|go)\b/.test(text) && !/safe(Href|Link)/.test(text) && dir !== 'icon') offenders.push(`${dir}: sets href without safeHref/safeLink`); // icon: the sprite's own address
    }
    assert.deepEqual(offenders, [], 'route the address through safeHref (anchors) or safeLink (navigation) from js/safe-url.js');
});
