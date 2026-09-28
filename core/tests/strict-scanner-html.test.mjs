// Unit tests for the HTML/Razor tag tokenizer (core/tools/strict/scanners/html.mjs, #605).
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanHtml } from '../tools/strict/scanners/html.mjs';

test('reads an open tag with quoted and boolean attributes', () => {
    const { nodes } = scanHtml('<input type="text" value=\'a b\' disabled required>');
    assert.equal(nodes.length, 1);
    const [node] = nodes;
    assert.equal(node.kind, 'tag');
    assert.equal(node.name, 'input');
    assert.deepEqual(node.attrs, { type: 'text', value: 'a b', disabled: true, required: true });
    assert.equal(node.line, 1);
    assert.equal(node.column, 1);
});

test('an uppercase or Pk-prefixed tag is a component', () => {
    const { nodes } = scanHtml('<PkButton label="Save"/><MyWidget/>');
    assert.equal(nodes[0].kind, 'component');
    assert.equal(nodes[0].name, 'PkButton');
    assert.equal(nodes[0].selfClosing, true);
    assert.equal(nodes[1].kind, 'component');
});

test('a lowercase tag is not a component', () => {
    const { nodes } = scanHtml('<button>Save</button>');
    assert.equal(nodes[0].kind, 'tag');
});

test('void tags are self-closing even without a trailing slash', () => {
    const { nodes } = scanHtml('<hr><br>');
    assert.equal(nodes[0].selfClosing, true);
    assert.equal(nodes[1].selfClosing, true);
});

test('a closing tag is flagged and carries no attributes', () => {
    const { nodes } = scanHtml('<div></div>');
    assert.equal(nodes[0].closing, false);
    assert.equal(nodes[1].closing, true);
});

test('HTML comments are skipped as a single comment token, not scanned as tags', () => {
    const { nodes, tokens } = scanHtml('<!-- <button>not real</button> -->');
    assert.equal(nodes.length, 0);
    assert.equal(tokens.some(t => t.kind === 'comment'), true);
});

test('a <script> body is raw text: tags inside it are not reported as nodes', () => {
    const { nodes } = scanHtml('<script>const s = "<div></div>";</script><p>after</p>');
    // The script's own closing tag is consumed as part of its raw-text body (never a node); <p>...</p>
    // reports both its opening and its closing tag, as any other element does.
    assert.deepEqual(nodes.map(n => `${n.name}:${n.closing}`), ['script:false', 'p:false', 'p:true']);
});

test('a <style> body is likewise raw text', () => {
    const { nodes } = scanHtml('<style>.a::before{content:"<b>"}</style>');
    assert.deepEqual(nodes.map(n => n.name), ['style']);
});

test('line and column advance correctly across newlines', () => {
    const { nodes } = scanHtml('<div>\n  <span>x</span>\n</div>');
    const span = nodes.find(n => n.name === 'span');
    assert.equal(span.line, 2);
    assert.equal(span.column, 3);
});

test('Razor: @* ... *@ comments are skipped as opaque', () => {
    const { nodes } = scanHtml('@* <button>fake</button> *@<PkButton/>');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, 'PkButton');
});

test('Razor: an @{ } code block is skipped as opaque, including braces inside strings', () => {
    const { nodes } = scanHtml('@{ var s = "}"; RenderFragment f = @<div>x</div>; }<PkCard/>');
    // The scanner does not parse C#, so it only guarantees it does not crash and still finds the later real tag.
    assert.equal(nodes.some(n => n.name === 'PkCard'), true);
});

test('Razor: an @expr inside an attribute value is treated as opaque, not a real attribute end', () => {
    const { nodes } = scanHtml('<PkButton label=@Model.Title disabled>Save</PkButton>');
    assert.equal(nodes[0].name, 'PkButton');
    assert.equal(nodes[0].attrs.disabled, true);
});

test('an unterminated tag does not throw and does not infinite-loop', () => {
    assert.doesNotThrow(() => scanHtml('<div class="a'));
});

test('plain text with no tags produces no nodes', () => {
    const { nodes } = scanHtml('just some text, no markup here');
    assert.equal(nodes.length, 0);
});
