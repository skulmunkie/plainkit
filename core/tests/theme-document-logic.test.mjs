// The one theme document (js/theme-document-logic.js): every entry point reads and writes it the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeDocument, writeDocumentText, readDocument, DOC_VERSION } from '../js/theme-document-logic.js';
import { buildSnippet, encodeShare, decodeShare } from '../js/theme-share-logic.js';
import { readSaved, serializeSaved, saveTheme, readOverridesInput, readCustomPresets } from '../js/theme-presets-logic.js';
import { settingsText, readSettings } from '../js/custom-sdk-files.js';

const theme = { shared: { '--radius-md': '4px' }, dark: { '--color-accent': '#111111' }, light: { '--color-accent': '#222222' } };

test('the document carries a version and the three sections, and reads back', () => {
    const d = writeDocument(theme);
    assert.equal(d.version, DOC_VERSION);
    assert.deepEqual(readDocument(writeDocumentText(theme)).doc.overrides, theme);
    assert.deepEqual(readDocument(d).doc.overrides, theme);
    assert.deepEqual(writeDocument(theme, { breakpoints: { tablet: 768, bad: -1, 'X y': 5 } }).breakpoints, { tablet: 768 });
    assert.deepEqual(readDocument(writeDocumentText(theme, { breakpoints: { tablet: 768 } })).doc.breakpoints, { tablet: 768 });
});

test('older formats still read: no version, plain sections, an override CSS block', () => {
    assert.deepEqual(readDocument(JSON.stringify(theme)).doc.overrides, theme);
    assert.equal(readDocument(JSON.stringify(theme)).doc.version, 1);
    assert.deepEqual(readDocument(buildSnippet({ ...theme, shared: {} })).doc.overrides, { ...theme, shared: {} }, 'a CSS block has no shared section: :root is the dark block');
});

test('round trip through every entry point gives the same overrides', async () => {
    assert.deepEqual((await decodeShare((await encodeShare(theme)).hash)).overrides, theme);
    const saved = saveTheme([], 'Mine', theme).list;
    assert.deepEqual(readSaved(serializeSaved(saved))[0].overrides, theme);
    assert.deepEqual(readOverridesInput(theme).overrides, theme);
    assert.deepEqual(readOverridesInput(writeDocumentText(theme)).overrides, theme);
    assert.deepEqual(readCustomPresets([{ name: 'P', theme: writeDocument(theme) }]).presets[0].overrides, theme);
    const file = settingsText({ version: '1.0.0', include: { theme: true, breakpoints: false }, theme });
    assert.deepEqual(readSettings(file, []).settings.theme, theme);
    assert.deepEqual(readDocument(file).doc.overrides, theme, 'a settings file is a document too');
});

test('hostile input is refused or stripped, never applied', async () => {
    for (const bad of ['', '   ', 'not json', '[1,2]', '{"foo":1}', '{"shared":{"x":"y"}}', '{"version":"1","shared":{"--a-b":"1"}}', '{"version":0,"shared":{"--a-b":"1"}}', `{"version":${DOC_VERSION + 1},"shared":{"--a-b":"1"}}`]) {
        assert.ok(readDocument(bad).error, bad);
    }
    const r = readDocument('{"shared":{"--a-b":"url(//evil)","--c-d":"<b>","--ok-x":"1"},"__proto__":{"polluted":1},"breakpoints":{"__proto__":9,"a":"1"}}');
    assert.deepEqual(r.doc.overrides.shared, { '--ok-x': '1' });
    assert.equal(r.doc.breakpoints, undefined);
    assert.equal({}.polluted, undefined);
    assert.deepEqual(readDocument({ shared: 'x', dark: [1], light: null }).doc.overrides, { shared: {}, dark: {}, light: {} });
    assert.ok(readSettings(JSON.stringify({ format: 'plainkit-custom-sdk', formatVersion: 1, theme: { version: 99, shared: {} } }), []).error);
    assert.deepEqual(readSaved('[{"name":"A","overrides":{"version":99}},null,5]').map(t => t.name), ['A']);
});
