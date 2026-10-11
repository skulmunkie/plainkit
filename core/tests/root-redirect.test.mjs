// The site root (core/index.html, the Pages landing page) only redirects to the gallery with a meta refresh. Anything it renders outside <noscript> is painted
// for the moment before the browser leaves: the owner saw the page's link list as an unstyled bulleted list "bounce" into the real layout on first load.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the root page redirects and renders nothing before it does (no first-load bounce)', () => {
    assert.match(html, /<meta http-equiv="refresh" content="0; url=site\/gallery\/index\.html">/);
    const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
    assert.equal(body.trim(), '', 'visible body content would be painted before the redirect: put it in <noscript>');
});
