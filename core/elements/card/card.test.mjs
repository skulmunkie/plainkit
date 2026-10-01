import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./card.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

// Issue #21: flush removed the content padding, and the heading row lost its padding with it.
test('a flush card keeps the padding of its heading row and drops only the body padding', () => {
    const css = read('css');
    assert.ok(css.includes(':host([flush]) [part="content"] { padding: 0; }'));
    const rule = css.match(/:host\(\[flush\]\) \[part="header"\] \{([^}]*)\}/);
    assert.ok(rule, 'a flush header rule');
    assert.match(rule[1], /padding: var\(--pk-card-padding, var\(--space-4\) 1\.25rem\)/);
    assert.match(rule[1], /margin-bottom: 0/);
});

test('the meta says the heading keeps its padding', () => {
    assert.match(prop('flush').description, /heading row keeps its padding/);
});

// Issue #764: the card renders no other element and has no state of its own (a page draws loading, empty and error into the body).
test('the card has no state props or part, and its source imports no state helper', () => {
    for (const n of ['state', 'stateHeading', 'stateDescription', 'retry']) assert.equal(prop(n), undefined, n);
    assert.equal(meta.parts.some(p => p.name === 'state'), false);
    assert.doesNotMatch(read('js'), /renderState|page-states/);
    assert.doesNotMatch(read('html'), /part="state"/);
    assert.doesNotMatch(read('css'), /part="state"|\[state/);
});
