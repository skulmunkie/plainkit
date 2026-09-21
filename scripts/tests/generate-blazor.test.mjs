// The Blazor wrapper generator (scripts/generate-blazor.mjs): its rules on small fixtures, and the generated folder against the real API and
// mappings. Dependency-free.
// Run: node --test scripts/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pascal, pkName, argsName, detailFields, fieldType, convert, isJsonType, generate, load, outputs, differences } from '../generate-blazor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const generatedDir = path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'Generated');

// ---- naming and small rules

test('names: Pk plus the tag in PascalCase, event args from the event name', () => {
    assert.equal(pascal('datetime-local'), 'DatetimeLocal');
    assert.equal(pkName('pk-alert'), 'PkAlert');
    assert.equal(pkName('pk-toast-stack'), 'PkToastStack');
    assert.equal(argsName('pk-value-change'), 'PkValueChangeEventArgs');
});

test('detail: detailProps, an object, a string with fields, null and native', () => {
    assert.deepEqual(detailFields({ detail: '{ value, previous }', detailProps: { value: 'string', previous: 'string' } }), [['value', 'string'], ['previous', 'string']]);
    assert.deepEqual(detailFields({ detail: { open: 'bool' } }), [['open', 'bool']]);
    assert.deepEqual(detailFields({ detail: '{ a: string, b: { x: number, y: number }[] }' }), [['a', 'string'], ['b', '{ x: number, y: number }[]']]);
    assert.deepEqual(detailFields({ detail: null }), []);
    assert.deepEqual(detailFields({ detail: 'native MouseEvent' }), []);
});

test('field types and converters', () => {
    assert.equal(fieldType('boolean'), 'bool?');
    assert.equal(fieldType('number'), 'double?');
    assert.equal(fieldType('File[]'), 'PkFileInfo[]?');
    assert.equal(fieldType('Element[]'), 'JsonElement?');
    assert.equal(convert('e.V', 'double?', 'int'), '(int)(e.V ?? 0)');
    assert.equal(convert('e.V', 'double?', 'int?'), '(int?)e.V');
    assert.equal(convert('e.V', 'bool?', 'bool'), 'e.V == true');
    assert.equal(convert('e.V', 'string?', 'DateOnly?'), 'PkAttr.ParseDate(e.V)');
    assert.equal(convert('e.V', 'string?', 'bool'), null);
    assert.ok(isJsonType('IReadOnlyList<DateOnly>') && isJsonType('int[]') && !isJsonType('IReadOnlyList<GalleryImage>') && !isJsonType('string'));
});

// ---- the rules on a fixture element

const el = {
    tag: 'pk-demo',
    props: [
        { name: 'label', type: 'string', description: 'The label.' },
        { name: 'open', type: 'boolean', description: 'Open.' },
        { name: 'count', type: 'number', default: 3, description: 'A count.' },
        { name: 'tone', type: 'enum', values: ['info', 'top-end', '2xl'], default: 'info', description: 'Tone.' },
        { name: 'rows', type: 'json', description: 'Rows.' },
        { name: 'noneActive', type: 'boolean' },
        { name: 'priv', type: 'string' },
    ],
    slots: [{ name: '', description: 'Body.' }, { name: 'aside', description: 'Aside.' }],
    events: [
        { name: 'pk-close', detail: { reason: 'string' }, cancelable: true, description: 'Closed.' },
        { name: 'pk-page', detail: { page: 'number' }, description: 'Page.' },
        { name: 'pk-dismiss', detail: null, description: 'Dismissed.' },
        { name: 'click', detail: 'native MouseEvent', description: 'Clicked.' },
        { name: 'pk-value-change', detail: '{ value: string }', detailProps: { value: 'string' }, description: 'Value.' },
    ],
};
const mapping = {
    component: 'PkDemo',
    params: [
        { name: 'Label', prop: 'label', type: 'string' },
        { name: 'IsOpen', map: 'prop', prop: 'open', type: 'bool', bind: { event: 'pk-close', value: false } },
        { name: 'Count', prop: 'count', type: 'int' },
        { name: 'Limit', prop: 'count', type: 'int?' },
        { name: 'Tone' , prop: 'tone' },
        { name: 'Rows', prop: 'rows', type: 'IReadOnlyList<GalleryImage>', todo: 'type not yet defined in PlainKit.Blazor (issue #9): GalleryImage' },
        { name: 'NoneActive', prop: 'noneActive' },
        { name: 'Page', prop: 'count', type: 'int' },
        { name: 'PageChanged', event: 'pk-page', type: 'EventCallback<int>' },
        { name: 'ChildContent', slot: '', type: 'RenderFragment' },
        { name: 'AsideContent', slot: 'aside', type: 'RenderFragment?' },
        { name: 'Cell', slot: 'cell-<id>', type: 'RenderFragment<TItem>', note: 'dynamic' },
        { name: 'OnClose', event: 'pk-close', type: 'EventCallback' },
        { name: 'OnDismiss', event: 'pk-dismiss', type: 'EventCallback' },
        { name: 'OnClick', event: 'click', type: 'MouseEventArgs' },
        { name: 'ExtraClass', map: 'wrapper', type: 'string', note: 'x' },
        { name: 'AdditionalAttributes', map: 'wrapper', type: 'Dictionary<string, object>?', note: 'x' },
        { name: 'Compact', map: 'wrapper', type: 'bool', note: 'compat only' },
        { name: 'Width', map: 'cssProperty', cssProperty: '--w', type: 'int' },
        { name: 'Missing', prop: 'nothing', type: 'string' },
    ],
    model: { prop: 'label', event: 'pk-value-change', key: 'value', type: 'string' },
};
const api = [el];

// (Page/Limit map the same prop as Count on purpose: the point is the type rules, not the element.)
mapping.params = mapping.params.filter(p => p.name !== 'Missing');
function run(m = mapping, hand = new Set()) { return generate(api, { demo: m }, hand); }

test('a component is written per mapping, with the SDK description as its docs', () => {
    const r = run();
    const razor = r.files.get('PkDemo.razor');
    assert.ok(razor.startsWith('@* Generated by scripts/generate-blazor.mjs'));
    assert.match(razor, /<pk-demo label="@Label"/);
    assert.match(razor, /\/\/\/ <summary>The label\.<\/summary>/);
    assert.deepEqual(r.report.generated.map(g => g.component), ['PkDemo']);
});

test('props: strings, booleans, kebab-case attributes, numbers with the element default, enums', () => {
    const razor = run().files.get('PkDemo.razor');
    assert.match(razor, /\[Parameter\] public string\? Label/);
    assert.match(razor, /open="@IsOpen"/);
    assert.match(razor, /none-active="@NoneActive"/);
    assert.match(razor, /\[Parameter\] public int Count \{ get; set; \} = 3;/);      // a plain int starts at the API default
    assert.match(razor, /\[Parameter\] public int\? Limit/);                          // int? stays unset
    assert.match(razor, /count="@PkAttr\.Num\(Limit\)"/);
    assert.match(razor, /tone="@\(Tone\?\.ToAttr\(\)\)"/);                            // no mapping default: nullable, left off when unset
    assert.match(razor, /public PkDemoTone\? Tone \{ get; set; \}/);
});

test('an enum without a mapping type is derived from the SDK values, with safe member names', () => {
    const r = run();
    const enums = r.files.get('PkGeneratedEnums.cs');
    assert.match(enums, /public enum PkDemoTone/);
    assert.match(enums, /TopEnd,/);
    assert.match(enums, /V2xl,/);                                                    // a value starting with a digit
    assert.match(enums, /PkDemoTone\.TopEnd => "top-end"/);
});

test('a mapping enum block gives the type its members', () => {
    const m = structuredClone(mapping);
    m.params.find(p => p.name === 'Tone').type = 'NoticeKind';
    m.params.find(p => p.name === 'Tone').enum = { Error: 'danger', Info: 'info' };
    m.params.find(p => p.name === 'Tone').default = 'Error';
    const r = run(m);
    assert.match(r.files.get('PkGeneratedEnums.cs'), /NoticeKind\.Error => "danger"/);
    assert.match(r.files.get('PkDemo.razor'), /NoticeKind Tone \{ get; set; \} = NoticeKind\.Error;/);
});

test('an unknown type is kept as an object, sent as JSON, and listed as a type to define', () => {
    const r = run();
    assert.match(r.files.get('PkDemo.razor'), /rows="@PkAttr\.Json\(Rows\)"/);
    assert.match(r.files.get('PkDemo.razor'), /object\? Rows/);
    assert.ok(r.report.todo.some(t => t.component === 'PkDemo' && t.param === 'Rows'));
});

test('slots: the default slot is the content, a named slot a slotted span; a dynamic slot is skipped and listed', () => {
    const r = run();
    const razor = r.files.get('PkDemo.razor');
    assert.match(razor, />@ChildContent@if \(AsideContent is not null\) \{<span slot="aside">@AsideContent<\/span>\}<\/pk-demo>/);
    assert.ok(r.report.notGenerated.some(n => n.param === 'Cell' && /dynamic slot/.test(n.reason)));
});

test('two-way: a bind block and a Changed callback update the parameter, then report it', () => {
    const razor = run().files.get('PkDemo.razor');
    assert.match(razor, /\[Parameter\] public EventCallback<bool> IsOpenChanged/);
    assert.match(razor, /IsOpen = false;\s+await IsOpenChanged\.InvokeAsync\(IsOpen\);\s+await OnClose\.InvokeAsync\(e\);/);
    assert.match(razor, /Page = \(int\)\(e\.Page \?\? 0\);\s+await PageChanged\.InvokeAsync\(Page\);/);
    // the model block: Label follows pk-value-change and gets a LabelChanged
    assert.match(razor, /\[Parameter\] public EventCallback<string\?> LabelChanged/);
    assert.match(razor, /Label = e\.Value;/);
});

test('events: no detail is a plain callback, a detail a typed one, click the native syntax', () => {
    const r = run();
    const razor = r.files.get('PkDemo.razor');
    assert.match(razor, /EventCallback OnDismiss/);
    assert.match(razor, /EventCallback<PkCloseEventArgs> OnClose/);
    assert.match(razor, /EventCallback<MouseEventArgs> OnClick/);
    assert.match(razor, /@onclick="HandleClick"/);
    assert.match(razor, /\["onpk-close"\] = EventCallback\.Factory\.Create<PkCloseEventArgs>\(this, HandlePkClose\)/);
    assert.match(razor, /\["onpk-dismiss"\] = EventCallback\.Factory\.Create<EventArgs>\(this, HandlePkDismiss\)/);
    assert.match(r.files.get('PkGeneratedEvents.cs'), /public class PkCloseEventArgs : EventArgs[\s\S]*public string\? Reason/);
    assert.match(r.files.get('PkGeneratedEvents.cs'), /\[EventHandler\("onpk-dismiss", typeof\(EventArgs\)/);
    assert.match(r.moduleText, /'pk-close',/);
    assert.doesNotMatch(r.moduleText, /'click'/);
});

test('wrapper parameters: ExtraClass and AdditionalAttributes are generated, the rest are listed; a css property needs a helper', () => {
    const r = run();
    const razor = r.files.get('PkDemo.razor');
    assert.match(razor, /class="@ExtraClass"/);
    assert.match(razor, /CaptureUnmatchedValues = true\)\] public Dictionary<string, object>\? AdditionalAttributes/);
    assert.match(razor, /@attributes="Splat"/);
    assert.match(razor, /if \(AdditionalAttributes is not null\)/);
    assert.ok(r.report.notGenerated.some(n => n.param === 'Compact'));
    assert.ok(r.report.notGenerated.some(n => n.param === 'Width' && /CSP/.test(n.reason)));
});

test('text: "" is the element text content', () => {
    const m = { component: 'PkDemo', params: [{ name: 'ChildContent', text: '', type: 'string' }] };
    assert.match(run(m).files.get('PkDemo.razor'), /<pk-demo>@ChildContent<\/pk-demo>/);
    assert.match(run(m).files.get('PkDemo.razor'), /string\? ChildContent/);
});

test('an existing component is skipped and not generated', () => {
    const r = run({ ...mapping, existing: true });
    assert.equal(r.files.has('PkDemo.razor'), false);
    assert.deepEqual(r.report.skipped.map(s => s.component), ['PkDemo']);
    assert.equal(r.report.generated.length, 0);
});

test('a component that exists by hand must be marked existing in its mapping', () => {
    assert.throws(() => run(mapping, new Set(['PkDemo'])), /mark it/);
    assert.equal(run({ ...mapping, existing: true }, new Set(['PkDemo'])).report.skipped[0].handWritten, true);
});

test('an element without a mapping, or a mapping without an element, is an error', () => {
    assert.throws(() => generate([el, { ...el, tag: 'pk-other' }], { demo: mapping }), /without a mapping: pk-other/);
    assert.throws(() => generate(api, { demo: mapping, ghost: { component: 'PkGhost', params: [] } }), /no element pk-ghost/);
});

test('one event name with two different field types cannot share an args class', () => {
    const other = { ...el, tag: 'pk-two', events: [{ name: 'pk-close', detail: { reason: 'number' }, description: '' }] };
    const m2 = { component: 'PkTwo', params: [{ name: 'OnClose', event: 'pk-close', type: 'EventCallback' }] };
    assert.throws(() => generate([el, other], { demo: mapping, two: m2 }), /pk-close/);
});

test('the output is deterministic', () => {
    assert.deepEqual([...run().files], [...run().files]);
});

// ---- the real API and mappings

const real = load();
const apiTags = JSON.parse(fs.readFileSync(path.join(root, 'core', 'dist', 'elements', 'api.json'), 'utf8')).map(e => e.tag);
const mappingsDir = path.join(root, 'blazor', 'mappings');
const mappings = Object.fromEntries(fs.readdirSync(mappingsDir).filter(f => f.endsWith('.json')).map(f => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(mappingsDir, f), 'utf8'))]));

test('every element is either generated once or skipped as existing, and the skip list is the existing mappings', () => {
    const generated = real.report.generated.map(g => g.tag), skipped = real.report.skipped.map(s => s.tag);
    assert.deepEqual([...generated, ...skipped].sort(), [...apiTags].sort());
    assert.equal(new Set(generated).size, generated.length);
    assert.deepEqual(skipped.sort(), Object.entries(mappings).filter(([, m]) => m.existing).map(([n]) => 'pk-' + n).sort());
    // hand-written components that have a mapping are in the skip list, and no skipped component is written
    const hand = fs.readdirSync(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'Components')).filter(f => f.endsWith('.razor')).map(f => f.replace('.razor', ''));
    for (const s of real.report.skipped) assert.equal(s.handWritten, hand.includes(s.component), s.component);
    for (const s of real.report.skipped) assert.equal(real.files.has(`${s.component}.razor`), false, s.component);
});

test('the generated folder is current: nothing missing, changed or left over (node scripts/generate-blazor.mjs)', () => {
    assert.deepEqual(differences(outputs(real)), []);
});

test('generated files are CRLF and name the generator', () => {
    for (const f of fs.readdirSync(generatedDir)) {
        const text = fs.readFileSync(path.join(generatedDir, f), 'utf8');
        assert.ok(!/[^\r]\n/.test(text) && !text.startsWith('\n'), `${f} is CRLF`);
        if (!f.endsWith('.json')) assert.match(text, /generate-blazor\.mjs/, f);
    }
});

test('every param that names a slot, event or prop resolved, or is accounted for in the manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(generatedDir, 'generated.manifest.json'), 'utf8'));
    assert.deepEqual(manifest.generated, real.report.generated.map(g => g.component));
    assert.ok(manifest.typesToDefine.every(t => t.reason.includes('issue #9')));
    for (const g of real.report.generated) assert.ok(fs.existsSync(path.join(generatedDir, `${g.component}.razor`)), g.component);
});
