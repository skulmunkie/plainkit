// The Guides: the content loader (tools/guides.mjs: front matter, ids, links between guides, images), the page's routing (site/guides/guides-logic.js) and the
// shipped content. The samples inside the guides are verified in scripts/tests/guides.test.mjs, which has the SDK's and Blazor's API to check them against.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGuides, guidesModule } from '../tools/guides.mjs';
import { parseHash, neighbours, routeHash } from '../site/guides/guides-logic.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const front = (title, order, summary = 'A summary.') => `---\ntitle: ${title}\norder: ${order}\nsummary: ${summary}\n---\n`;

/** A folder of guides: { 'a.md': text, 'img/x.png': 'bytes' }; the callback gets its path and it is removed afterwards. */
function withGuides(files, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-guides-'));
    try {
        for (const [name, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), text); }
        return fn(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('guides are read from Markdown, ordered by `order`, with their headings and HTML', () => {
    withGuides({ 'b.md': front('Second', 2) + '## Two\n', 'a.md': front('First', 1) + '## One\n\nText.\n' }, dir => {
        const { guides, problems } = loadGuides(dir);
        assert.deepEqual(problems, []);
        assert.deepEqual(guides.map(g => [g.id, g.title, g.order, g.summary]), [['a', 'First', 1, 'A summary.'], ['b', 'Second', 2, 'A summary.']]);
        assert.deepEqual(guides[0].headings, [{ level: 2, id: 'one', text: 'One' }]);
        assert.match(guides[0].html, /^<h2 id="one">One<a class="anchor"/);
    });
});

test('front matter, the file name and duplicate orders are checked, and every problem names its file', () => {
    withGuides({ 'no-front.md': '## A\n', 'Bad_Name.md': front('X', 5), 'c.md': front('C', 'two'), 'd.md': front('D', 7), 'e.md': front('E', 7) }, dir => {
        const p = loadGuides(dir).problems.join('\n');
        for (const key of ['title', 'order', 'summary']) assert.match(p, new RegExp(`no-front\\.md: front matter needs ${key}`));
        assert.match(p, /Bad_Name\.md: the file name is the guide's address/);
        assert.match(p, /c\.md: order must be a whole number, not "two"/);
        assert.match(p, /d\.md: order 7 is used by another guide/);
        assert.throws(() => guidesModule(dir), /site\/guides\/content: \d+ problem\(s\)/);
    });
});

test('a link to another guide becomes its address; a missing guide or heading is a problem', () => {
    withGuides({ 'a.md': front('A', 1) + '## Top\n\n[b](b.md) and [inside](b.md#deep-part) and [gone](gone.md) and [nowhere](b.md#nope) and [file](../x/y.md).\n', 'b.md': front('B', 2) + '## Deep part\n' }, dir => {
        const { guides, problems } = loadGuides(dir);
        assert.match(guides[0].html, /<a href="#\/b">b<\/a> and <a href="#\/b\/deep-part">inside<\/a>/);
        assert.match(guides[0].html, /<a href="\.\.\/x\/y\.md">file<\/a>/, 'a path is an ordinary link, not a guide link');
        assert.deepEqual(problems, ['a.md: link to gone.md: no such guide', 'a.md: b.md has no heading "nope"']);
    });
});

test('an image is a file next to the guides (its address is rewritten); a missing, remote or escaping one is a problem', () => {
    withGuides({ 'a.md': front('A', 1) + '![ok](img/x.png)\n\n![missing](img/none.png)\n\n![remote](https://example.com/x.png)\n\n![up](../secret.png)\n', 'img/x.png': 'x' }, dir => {
        const { guides, problems } = loadGuides(dir);
        assert.match(guides[0].html, /<img src="content\/img\/x\.png" alt="ok" loading="lazy">/);
        assert.equal(problems.length, 3);
        assert.ok(problems.every(p => /^a\.md: image .* was not found$/.test(p)));
    });
});

test('an empty or missing folder is no guides and no problem', () => {
    withGuides({}, dir => assert.deepEqual(loadGuides(dir), { guides: [], problems: [] }));
    assert.deepEqual(loadGuides(path.join(os.tmpdir(), 'pk-guides-does-not-exist')), { guides: [], problems: [] });
});

test('routes: the list, a guide, a heading in it, an unknown guide, and a bare in-page fragment', () => {
    const ids = ['getting-started', 'theming'];
    assert.deepEqual(['', '#', '#/'].map(h => parseHash(h, ids).kind), ['home', 'home', 'home']);
    assert.deepEqual(parseHash('#/theming', ids), { kind: 'guide', id: 'theming', frag: null });
    assert.deepEqual(parseHash('#/theming/change-a-token', ids), { kind: 'guide', id: 'theming', frag: 'change-a-token' });
    assert.deepEqual(parseHash('#/nope', ids), { kind: 'missing', id: 'nope' });
    assert.deepEqual(parseHash('#install', ids), { kind: 'anchor', id: 'install' });
    assert.deepEqual(parseHash('#/theming/a%20b', ids), { kind: 'guide', id: 'theming', frag: 'a b' });
    assert.deepEqual(parseHash('#%E0%A4%A', ids), { kind: 'anchor', id: '%E0%A4%A' }, 'a malformed escape is kept as typed');
    assert.equal(routeHash('theming'), '#/theming');
    assert.equal(routeHash('theming', 'x'), '#/theming/x');
});

test('previous and next follow the reading order and stop at the ends', () => {
    const g = ['a', 'b', 'c'].map(id => ({ id }));
    assert.deepEqual(neighbours(g, 'a'), { prev: null, next: g[1], index: 0 });
    assert.deepEqual(neighbours(g, 'b'), { prev: g[0], next: g[2], index: 1 });
    assert.deepEqual(neighbours(g, 'c'), { prev: g[1], next: null, index: 2 });
    assert.deepEqual(neighbours(g, 'zzz'), { prev: null, next: null, index: -1 });
});

test('the shipped guides are valid, ordered, and the generated module is exactly what they convert to', async () => {
    const { guides, problems } = loadGuides();
    assert.deepEqual(problems, []);
    assert.deepEqual(guides.map(g => g.id), ['getting-started', 'getting-started-blazor', 'theming', 'logging']);
    for (const g of guides) {
        assert.ok(g.title && g.summary, `${g.id} has a title and a summary`);
        assert.ok(g.headings.filter(h => h.level === 2).length >= 3, `${g.id} has sections`);
        assert.doesNotMatch(g.html, /<script|<style|<[a-z][^>]*\son\w+=|javascript:/i, `${g.id} carries no active markup`);
    }
    const { GUIDES } = await import('../site/guides/guides.data.js');
    assert.deepEqual(JSON.parse(JSON.stringify(GUIDES)), guides);
    assert.equal(read('site/guides/guides.data.js'), guidesModule().replace(/\r?\n/g, '\n'));
});

test('the Guides page is real: no "coming soon" left in the page or the shell, and its scripts and styles are files', () => {
    const page = read('site/guides/index.html');
    assert.doesNotMatch(page + read('site/guides/page.js') + read('site/shell.js'), /coming soon/i);
    assert.match(page, /<script type="module" src="page\.js">/);
    assert.match(page, /href="guides\.css"/);
    assert.match(read('site/shell.js'), /key: 'guides', title: 'Guides', href: '\.\.\/guides\/index\.html'/);
});
