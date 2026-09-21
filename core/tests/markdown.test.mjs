// The Guides' Markdown converter (tools/markdown.mjs): fixtures for every construct it reads, and for what it must never let through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml, parseFrontMatter, escapeHtml } from '../tools/markdown.mjs';

const html = (md, options) => markdownToHtml(md, options).html;
const anchor = id => `<a class="anchor" href="#${id}" aria-label="Link to this section"></a>`;

test('front matter gives title, order and summary; a file without it has none', () => {
    const { data, body } = parseFrontMatter('---\ntitle: "Getting started"\norder: 2\nsummary: One line.\n---\nText\n');
    assert.deepEqual(data, { title: 'Getting started', order: '2', summary: 'One line.' });
    assert.equal(body, 'Text\n');
    assert.deepEqual(parseFrontMatter('Just text').data, {});
    assert.equal(parseFrontMatter('---\r\ntitle: A\r\n---\r\nB').body, 'B');
});

test('headings get stable, unique ids and a permalink link that carries no text', () => {
    const r = markdownToHtml('## Install\n\n### Install\n\n## The `pk-card` element\n');
    assert.equal(r.html, `<h2 id="install">Install${anchor('install')}</h2>\n<h3 id="install-2">Install${anchor('install-2')}</h3>\n<h2 id="the-pk-card-element">The <code>pk-card</code> element${anchor('the-pk-card-element')}</h2>`);
    assert.deepEqual(r.headings, [{ level: 2, id: 'install', text: 'Install' }, { level: 3, id: 'install-2', text: 'Install' }, { level: 2, id: 'the-pk-card-element', text: 'The pk-card element' }]);
    assert.deepEqual(r.problems, []);
    assert.equal(markdownToHtml('## Install\n').html, markdownToHtml('## Install\n').html, 'deterministic');
});

test('a body h1 and a skipped heading level are reported', () => {
    assert.match(markdownToHtml('# Title\n').problems[0], /front matter/);
    assert.match(markdownToHtml('## A\n\n#### B\n').problems[0], /jumps from h2 to h4/);
    assert.match(markdownToHtml('### A\n').problems[0], /jumps from h1 to h3/);
});

test('paragraphs join their lines; inline code, bold and italic', () => {
    assert.equal(html('one\ntwo\n\nthree'), '<p>one two</p>\n<p>three</p>');
    assert.equal(html('a `x < y` b'), '<p>a <code>x &lt; y</code> b</p>');
    assert.equal(html('``a`b``'), '<p><code>a`b</code></p>');
    assert.equal(html('**bold**, *it* and _also_'), '<p><strong>bold</strong>, <em>it</em> and <em>also</em></p>');
    assert.equal(html('snake_case_name and 2*3*4'), '<p>snake_case_name and 2*3*4</p>');
    assert.equal(html('`**not bold**`'), '<p><code>**not bold**</code></p>');
});

test('links: http(s), mailto, fragments and relative paths pass; emphasis and code work inside; guide links go through linkFor', () => {
    assert.equal(html('[a](https://example.com/x?a=1&b=2)'), '<p><a href="https://example.com/x?a=1&amp;b=2">a</a></p>');
    assert.equal(html('[m](mailto:someone@example.com) [f](#x) [r](../x/y.html)'), '<p><a href="mailto:someone@example.com">m</a> <a href="#x">f</a> <a href="../x/y.html">r</a></p>');
    assert.equal(html('[`pk-card` **docs**](x.html)'), '<p><a href="x.html"><code>pk-card</code> <strong>docs</strong></a></p>');
    const linkFor = href => (href === 'theming.md' ? '#/theming' : null);
    assert.equal(html('[t](theming.md)', { linkFor }), '<p><a href="#/theming">t</a></p>');
    assert.match(markdownToHtml('[t](missing.md)', { linkFor }).problems[0], /no such guide/);
});

test('nothing dangerous gets through: raw HTML is text, unsafe addresses are dropped and reported', () => {
    assert.equal(html('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    assert.equal(html('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    for (const bad of [['java', 'script:alert(1)'].join(''), ['JaVa', 'ScRiPt:alert(1)'].join(''), 'data:text/html;base64,AAAA', 'vbscript:x']) {
        const r = markdownToHtml(`[x](${bad.replace(/ /g, '')})\n\n![y](${bad.replace(/ /g, '')})`);
        assert.doesNotMatch(r.html, /<a |<img /, bad);
        assert.equal(r.problems.length, 2, bad);
    }
    assert.equal(html('[x](a"onmouseover="y)'), '<p><a href="a&quot;onmouseover=&quot;y">x</a></p>', 'a quote cannot leave the attribute');
    assert.equal(html('![a"b](x.png)'), '<p><img src="x.png" alt="a&quot;b" loading="lazy"></p>');
    assert.equal(html('```html\n<script>x</script>\n```'), '<pk-code-block label="html">&lt;script&gt;x&lt;/script&gt;</pk-code-block>');
    assert.equal(html('a \uE000 b'), '<p>a  b</p>');
    assert.equal(escapeHtml(`<&>"`), '&lt;&amp;&gt;&quot;');
});

test('images can be rewritten and checked by the caller', () => {
    const imageFor = src => (src === 'gone.png' ? null : `content/${src}`);
    assert.equal(html('![Shot](shot.png)', { imageFor }), '<p><img src="content/shot.png" alt="Shot" loading="lazy"></p>');
    assert.match(markdownToHtml('![x](gone.png)', { imageFor }).problems[0], /was not found/);
});

test('fenced code keeps its text and indentation and names its language as the pk-code-block label', () => {
    assert.equal(html('```csharp\nvar x = 1;\n  if (x < 2) { }\n```'), '<pk-code-block label="csharp">var x = 1;\n  if (x &lt; 2) { }</pk-code-block>');
    assert.equal(html('```\nplain\n```'), '<pk-code-block>plain</pk-code-block>');
    assert.equal(html('~~~js\na\n~~~'), '<pk-code-block label="js">a</pk-code-block>');
    assert.equal(html('````md\n```\nx\n```\n````'), '<pk-code-block label="md">```\nx\n```</pk-code-block>');
    assert.match(markdownToHtml('```js\nnever closed').problems[0], /never closed/);
    assert.equal(html('## H\n```\n## not a heading\n```'), `<h2 id="h">H${anchor('h')}</h2>\n<pk-code-block>## not a heading</pk-code-block>`);
});

test('lists: bullets, numbers, a start number, nesting and a lazy continuation line', () => {
    assert.equal(html('- a\n- b\n\n1. c'), '<ul><li>a</li><li>b</li></ul>\n<ol><li>c</li></ol>');
    assert.equal(html('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
    assert.equal(html('3. a\n4. b'), '<ol start="3"><li>a</li><li>b</li></ol>');
    assert.equal(html('- a\n  - b\n  - c\n- d'), '<ul><li>a\n<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>');
    assert.equal(html('- a\n    - b'), '<ul><li>a\n<ul><li>b</li></ul></li></ul>');
    assert.equal(html('- one\n  continues\n- two'), '<ul><li>one continues</li><li>two</li></ul>');
    assert.equal(html('- a\n\n- b'), '<ul><li>a</li><li>b</li></ul>');
    assert.equal(html('1. Step\n\n   ```js\n   x();\n   ```\n2. Next'), '<ol><li><p>Step</p>\n<pk-code-block label="js">x();</pk-code-block></li><li>Next</li></ol>');
    assert.equal(html('text\n- a'), '<p>text</p>\n<ul><li>a</li></ul>');
});

test('tables become a scrollable region with header cells; escaped pipes stay in the cell', () => {
    const r = html('| Name | Use |\n|---|:-:|\n| `a` | one \\| two |\n| b |\n');
    assert.equal(r, '<div class="table-wrap" role="region" aria-label="Table" tabindex="0"><table><thead><tr><th scope="col">Name</th><th scope="col">Use</th></tr></thead><tbody><tr><td><code>a</code></td><td>one | two</td></tr><tr><td>b</td><td></td></tr></tbody></table></div>');
    assert.equal(html('a | b\n\nnot a table'), '<p>a | b</p>\n<p>not a table</p>');
});

test('blockquotes are alerts: info by default, a first line picks the kind, content is Markdown', () => {
    assert.equal(html('> plain **note**'), '<pk-alert kind="info"><p>plain <strong>note</strong></p></pk-alert>');
    assert.equal(html('> [!warning] Mind this\n> and this\n>\n> - a\n> - b'), '<pk-alert kind="warning"><p>Mind this and this</p>\n<ul><li>a</li><li>b</li></ul></pk-alert>');
    assert.equal(html('> [!tip]\n> Nice'), '<pk-alert kind="success"><p>Nice</p></pk-alert>');
    assert.match(markdownToHtml('> [!loud] x').problems[0], /not an alert kind/);
});

test('horizontal rules, and a rule is not a list', () => {
    assert.equal(html('a\n\n---\n\nb'), '<p>a</p>\n<hr>\n<p>b</p>');
    assert.equal(html('***'), '<hr>');
});

test('a whole page converts, and converting it again gives the same bytes', () => {
    const md = '## One\n\nText with [a link](#one).\n\n- x\n- y\n\n```html\n<pk-button>Go</pk-button>\n```\n\n> [!note] Read this.\n\n### Two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
    const a = markdownToHtml(md), b = markdownToHtml(md);
    assert.deepEqual(a, b);
    assert.deepEqual(a.problems, []);
    assert.deepEqual(a.headings.map(h => h.id), ['one', 'two']);
});
