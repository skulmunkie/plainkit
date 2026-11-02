// --font-heading (#1817): declared once in tokens.css, defaulting to the body font, used by the title parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('--font-heading is declared in tokens.css and defaults to the body font', () => {
    assert.match(read('../tokens/tokens.css'), /--font-heading:\s*var\(--font-sans,/);
});

test('the heading, page-header title and card title parts use --font-heading', () => {
    assert.match(read('../elements/heading/heading.css'), /\[part="heading"\]\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
    assert.match(read('../components/page-header/page-header.css'), /\[part="title"\]\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
    assert.match(read('../elements/card/card.css'), /\[part="title"\]\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
});

test('only tokens.css declares the token (themes may override it)', () => {
    for (const p of ['../elements/heading/heading.css', '../components/page-header/page-header.css', '../elements/card/card.css']) assert.doesNotMatch(read(p), /--font-heading\s*:/, p);
});
