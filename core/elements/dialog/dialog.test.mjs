// Unit tests for the dialog patterns' decisions. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeSize, outcome, promptProblem, initialFocus } from './dialog.js';

test('an unknown size is medium', () => {
    assert.equal(normalizeSize('huge'), 'md');
    assert.equal(normalizeSize('fullscreen'), 'fullscreen');
});

test('confirm resolves true or false, alert resolves nothing, prompt resolves the text or null', () => {
    assert.equal(outcome('confirm', 'ok'), true);
    assert.equal(outcome('confirm', 'cancel'), false);
    assert.equal(outcome('confirm', ''), false, 'Escape is a no');
    assert.equal(outcome('alert', 'ok'), undefined);
    assert.equal(outcome('prompt', 'ok', 'Boxes'), 'Boxes');
    assert.equal(outcome('prompt', 'cancel', 'Boxes'), null);
});

test('prompt validation: required, length and a safe pattern', () => {
    assert.equal(promptProblem('  ', { required: true }), 'This field is required.');
    assert.equal(promptProblem('abc', { maxLength: 2 }), 'Use at most 2 characters.');
    assert.equal(promptProblem('PO-12', { pattern: '^PO-\\d+$' }), '');
    assert.equal(promptProblem('PO-x', { pattern: '^PO-\\d+$', message: 'Use PO-number.' }), 'Use PO-number.');
    assert.equal(promptProblem('aaa', { pattern: '(a+)+$' }), 'Enter a valid value.', 'a backtracking pattern is refused, not run');
    assert.equal(promptProblem('a', { pattern: '[' }), 'Enter a valid value.', 'a broken pattern is refused');
    assert.equal(promptProblem('', {}), '');
});

test('a destructive confirm focuses Cancel; a prompt focuses its field', () => {
    assert.equal(initialFocus('confirm', true), 'cancel');
    assert.equal(initialFocus('confirm', false), 'ok');
    assert.equal(initialFocus('prompt', false), 'input');
    assert.equal(initialFocus('alert', false), 'ok');
});

test('the template is a native dialog with a close control and no backdrop handler', () => {
    const html = fs.readFileSync(new URL('./dialog.html', import.meta.url), 'utf8');
    assert.match(html, /<dialog/);
    assert.match(html, /data-action="close"/);
    assert.ok(!/\sstyle=|\son\w+=/.test(html));
});

