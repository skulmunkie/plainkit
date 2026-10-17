// The Blazor wrapper generator (scripts/generate-blazor.mjs): its rules on small fixtures, and the generated folder against the real API and
// mappings. Dependency-free.
// Run: node --test scripts/tests/*.test.mjs
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pascal, pkName, argsName, detailFields, fieldType, convert, isJsonType, knownTypes, generate, load, outputs, differences, tierNamespace, TIER_NAMESPACES } from '../generate-blazor.mjs';

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
    tier: 'element',
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

test('a JSON prop takes the public type its mapping names (issue #77): a record, or a collection of records, once the package declares it', () => {
    assert.ok(!isJsonType('PkChartData') && isJsonType('PkChartData', new Set(['PkChartData'])));
    assert.ok(isJsonType('IReadOnlyList<PkGalleryImage>?', new Set(['PkGalleryImage'])) && !isJsonType('IReadOnlyList<PkGalleryImage>'));
    const typed = structuredClone(mapping);
    typed.params.find(p => p.name === 'Rows').type = 'IReadOnlyList<DemoRow>';
    delete typed.params.find(p => p.name === 'Rows').todo;
    const r = generate(api, { demo: typed }, new Set(), new Set(['DemoRow']));
    const razor = r.files.get('PkDemo.razor');
    assert.match(razor, /\[Parameter\] public IReadOnlyList<DemoRow>\? Rows/);
    assert.match(razor, /rows="@PkAttr\.Json\(Rows\)"/);
    assert.ok(!r.report.todo.some(t => t.param === 'Rows'));
    // a type the package does not declare stays an object and is listed, as before
    assert.ok(generate(api, { demo: typed }).report.todo.some(t => t.param === 'Rows'));
    // a record on its own (not a collection) is a JSON value too when the element prop is json
    const bare = structuredClone(mapping);
    bare.params.find(p => p.name === 'Rows').type = 'DemoRows';
    delete bare.params.find(p => p.name === 'Rows').todo;
    assert.match(generate(api, { demo: bare }, new Set(), new Set(['DemoRows'])).files.get('PkDemo.razor'), /\[Parameter\] public DemoRows\? Rows/);
});

test('a JSON prop with no mapping type stays an object but is listed as a type to define', () => {
    const untyped = structuredClone(mapping);
    delete untyped.params.find(p => p.name === 'Rows').type;
    delete untyped.params.find(p => p.name === 'Rows').todo;
    const r = generate(api, { demo: untyped }, new Set(), new Set());
    assert.match(r.files.get('PkDemo.razor'), /object\? Rows/);
    assert.ok(r.report.todo.some(t => t.param === 'Rows' && /no mapping type/.test(t.reason)));
});

test('knownTypes reads the public records of the package; the real chart and image gallery use them', () => {
    const known = knownTypes(path.join(root, 'blazor', 'src', 'PlainKit.Blazor'));
    for (const t of ['PkChartData', 'PkChartSeries', 'PkGalleryImage', 'PkTableColumn', 'PkCrumb', 'PkRuntime']) assert.ok(known.has(t), t);
    assert.ok(!known.has('Generated') && !known.has('PkAttr'), 'internal types are not offered');
    const razor = name => fs.readFileSync(path.join(generatedDir, name + '.razor'), 'utf8');
    assert.match(razor('PkChart'), /\[Parameter\] public PkChartData\? Data/);
    assert.match(razor('PkImageGallery'), /\[Parameter\] public IReadOnlyList<PkGalleryImage>\? Images/);
});

test('no generated parameter is an unexplained object: each one is in the manifest as a type to define', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(generatedDir, 'generated.manifest.json'), 'utf8'));
    const listed = new Set(manifest.typesToDefine.map(t => `${t.component}.${t.param}`));
    for (const f of fs.readdirSync(generatedDir).filter(x => x.endsWith('.razor')))
        for (const m of fs.readFileSync(path.join(generatedDir, f), 'utf8').matchAll(/\[Parameter\] public object\? (\w+)/g))
            assert.ok(listed.has(`${f.replace('.razor', '')}.${m[1]}`) || fs.readFileSync(path.join(generatedDir, f), 'utf8').includes(`PkAttr.JsonText(${m[1]})`), `${f} ${m[1]} is object? and not explained in the manifest (a jsonText parameter is explained by its helper)`);
    assert.deepEqual(manifest.typesToDefine, [], 'today every JSON parameter has a type');
});

test('slots: the default slot is the content, a named slot a slotted span; a dynamic slot is skipped and listed', () => {
    const r = run();
    const razor = r.files.get('PkDemo.razor');
    assert.match(razor, />@ChildContent@if \(AsideContent is not null\) \{<span slot="aside" class="u-contents">@AsideContent<\/span>\}<\/pk-demo>/);
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

test('two-way: a JSON bind keeps an object event field as raw text; a callback can update a prop after it succeeds', () => {
    const grid = fs.readFileSync(path.join(generatedDir, 'PkPropertyGrid.razor'), 'utf8');
    assert.match(grid, /Values = e\.Values\?\.GetRawText\(\);\s+await ValuesChanged\.InvokeAsync\(Values as string\);/);
    const settings = fs.readFileSync(path.join(generatedDir, 'PkSettingsPage.razor'), 'utf8');
    assert.match(settings, /await Save!\(a\); await InvokeAsync\(async \(\) => \{ Values = JsonSerializer\.Serialize\(a\); await ValuesChanged\.InvokeAsync\(Values as string\); \}\)/);
});

test('two-way: an enum parameter follows a string event field through a generated parser and reports the enum (#1444)', () => {
    const m = structuredClone(mapping);
    m.params = m.params.filter(p => p.name !== 'Tone');
    m.params.push({ name: 'Tone', prop: 'tone', type: 'DemoTone', default: 'info', bind: { event: 'pk-value-change', value: 'detail.value' } });
    const r = run(m);
    const razor = r.files.get('PkDemo.razor');
    assert.match(razor, /\[Parameter\] public EventCallback<DemoTone> ToneChanged/);
    assert.match(razor, /Tone = e\.Value\.ToDemoTone\(\) \?\? Tone;[\s\S]*await ToneChanged\.InvokeAsync\(Tone\);/);
    assert.match(r.files.get('PkGeneratedEnums.cs'), /internal static DemoTone\? ToDemoTone\(this string\? value\) => value switch[\s\S]*"info" => DemoTone\.Info,[\s\S]*_ => null,/);
    // an enum nothing binds gets no parser
    assert.doesNotMatch(run().files.get('PkGeneratedEnums.cs'), /ToDemoTone|ToTone\(/);
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
    assert.match(razor, /class="@Css\(ExtraClass\)"/);
    assert.match(razor, /@attributes="Splat"/);
    // AdditionalAttributes is captured once, by PkElementBase, not declared per component
    assert.doesNotMatch(razor, /AdditionalAttributes/);
    assert.ok(r.report.notGenerated.some(n => n.param === 'Compact'));
    assert.ok(r.report.notGenerated.some(n => n.param === 'Width' && /CSP/.test(n.reason)));
});

test('every component takes unmatched attributes: class is merged, the rest splatted, without ExtraClass too', () => {
    const plain = run({ component: 'PkDemo', params: [{ name: 'Label', prop: 'label', type: 'string' }] }).files.get('PkDemo.razor');
    assert.match(plain, /class="@Css\(\)"/);
    assert.match(plain, /@attributes="Splat"/);
    assert.doesNotMatch(plain, /AdditionalAttributes/);
    // the class attribute comes before the splat, and the splat never carries class (PkAttr.Merge drops it), so the merged value wins
    assert.ok(plain.indexOf('class="@Css()"') < plain.indexOf('@attributes="Splat"'));
});

test('the event handlers are added once (AddEventHandlers), never rebuilt in OnParametersSet', () => {
    const razor = run().files.get('PkDemo.razor');
    assert.match(razor, /protected override void AddEventHandlers\(Dictionary<string, object> handlers\)/);
    assert.match(razor, /handlers\["onpk-close"\] = EventCallback\.Factory\.Create<PkCloseEventArgs>\(this, HandlePkClose\);/);
    assert.doesNotMatch(razor, /OnParametersSet|new Dictionary<string, object>/);
    // a component with no custom event has no override at all
    assert.doesNotMatch(run({ component: 'PkDemo', params: [{ name: 'Label', prop: 'label', type: 'string' }] }).files.get('PkDemo.razor'), /AddEventHandlers/);
});

test('invert: a bool parameter is sent as the negation of its prop, still a plain attribute', () => {
    const m = { component: 'PkDemo', params: [{ name: 'Boxed', prop: 'open', type: 'bool', default: true, invert: true }] };
    const razor = run(m).files.get('PkDemo.razor');
    assert.match(razor, /open="@\(!Boxed\)"/);
    assert.match(razor, /\[Parameter\] public bool Boxed \{ get; set; \} = true;/);
});

test('every pk-* event of every element is registered and mapped, whether or not a component listens for it (issue #49)', () => {
    const m = { component: 'PkDemo', existing: true, params: [{ name: 'OnClose', event: 'pk-close', type: 'EventCallback' }] };
    const r = run(m, new Set(['PkDemo']));
    assert.match(r.files.get('PkGeneratedEvents.cs'), /\[EventHandler\("onpk-close", typeof\(PkCloseEventArgs\)/);
    assert.match(r.moduleText, /'pk-close',/);
    assert.equal(r.files.has('PkDemo.razor'), false);
    // a skipped component that is not hand-written registers them too: raw <pk-demo @onpk-close=...> markup needs the [EventHandler] class
    assert.match(run(m).files.get('PkGeneratedEvents.cs'), /\[EventHandler\("onpk-close", typeof\(PkCloseEventArgs\)/);
    assert.match(run(m).moduleText, /'pk-close',/);
    // a component with no event parameter still registers the element's events
    assert.match(run({ component: 'PkDemo', params: [{ name: 'Label', prop: 'label', type: 'string' }] }).files.get('PkGeneratedEvents.cs'), /onpk-close/);
});

test('the real manifest: every pk-* event has an [EventHandler] class and a browser-side registration (raw <pk-table @onpk-sort> works)', () => {
    const api = JSON.parse(fs.readFileSync(path.join(root, 'core', 'dist', 'elements', 'api.json'), 'utf8'));
    const names = [...new Set(api.flatMap(e => (e.events ?? []).map(v => v.name)).filter(n => n.startsWith('pk-')))];
    const events = real.files.get('PkGeneratedEvents.cs');
    for (const n of names) {
        assert.ok(events.includes('[EventHandler("on' + n + '"'), n + ' has an [EventHandler]');
        assert.ok(real.moduleText.includes("'" + n + "',"), n + ' is registered in the module');
    }
    for (const n of ['pk-sort', 'pk-filter', 'pk-row-click', 'pk-row-expand']) assert.ok(names.includes(n), n);
    assert.match(events, /\[EventHandler\("onpk-sort", typeof\(PkSortEventArgs\)/);
});

test('text: "" is the element text content', () => {
    const m = { component: 'PkDemo', params: [{ name: 'ChildContent', text: '', type: 'string' }] };
    assert.match(run(m).files.get('PkDemo.razor'), /@attributes="Splat">@ChildContent<\/pk-demo>/);
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

test('the generator is deterministic and the generated folder is what it produces: nothing missing, changed or left over (run node scripts/bootstrap.mjs)', () => {
    assert.deepEqual([...outputs(load())], [...outputs(real)], 'two runs of the generator differ');
    assert.deepEqual(differences(outputs(real)), [], 'run node scripts/bootstrap.mjs');
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

test('two-way: a bind can name several events (one sets true, another false), and every component holds its element', () => {
    const m = structuredClone(mapping);
    m.params.find(p => p.name === 'IsOpen').bind = [{ event: 'pk-dismiss', value: true }, { event: 'pk-close', value: false }];
    const razor = run(m).files.get('PkDemo.razor');
    assert.match(razor, /IsOpen = true;\s+await IsOpenChanged\.InvokeAsync\(IsOpen\);/);
    assert.match(razor, /IsOpen = false;\s+await IsOpenChanged\.InvokeAsync\(IsOpen\);\s+await OnClose\.InvokeAsync\(e\);/);
    assert.equal(razor.match(/EventCallback<bool> IsOpenChanged/g).length, 1);
    assert.match(razor, /@ref="Element"/);
});

test('the real palette and combobox are two-way on Open from the events the elements raise', () => {
    const razor = name => fs.readFileSync(path.join(generatedDir, name + '.razor'), 'utf8');
    assert.match(razor('PkCommandPalette'), /Open = true;\s+await OpenChanged\.InvokeAsync\(Open\);\s+await OnOpen\.InvokeAsync\(\);/);
    assert.match(razor('PkCommandPalette'), /Open = false;\s+await OpenChanged\.InvokeAsync\(Open\);/);
    assert.match(razor('PkCombobox'), /Open = e\.Open == true;\s+await OpenChanged\.InvokeAsync\(Open\);\s+await OnToggle\.InvokeAsync\(e\);/);
});

// ---- the pk-select detail of a PkTable is sent as runs of row indexes (a big selection closed the circuit: SignalR's 32 KB receive limit)

function selectArgs(element, detail) {
    const src = fs.readFileSync(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot', 'PlainKit.Blazor.lib.module.js'), 'utf8');
    const handlers = {};
    new Function('exports', src.replace(/export function afterStarted[^\n]*\n/, '').replace(/export function afterWebStarted[^\n]*\n/, '') + '; exports.register = register;')(handlers);
    const types = {};
    handlers.register({ registerCustomEventType: (name, o) => { types[name] = o; } });
    return types['pk-select'].createEventArgs({ target: element, type: 'pk-select', detail });
}

const tableElement = (n, marked = true) => ({ hasAttribute: a => marked && a === 'data-pk-ranges', rows: Array.from({ length: n }, (_, i) => ({ id: 'id-' + i })), rowKey: 'id' });
const ids = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => 'id-' + (from + i));

test('a select-all of a marked pk-table is one run, a few bytes instead of every id', () => {
    const detail = { selected: ids(0, 4999) };
    const args = selectArgs(tableElement(5000), detail);
    // compared as sent: the keys a pk-table select leaves undefined (scope and query belong to pk-data-table) are not on the wire
    assert.deepEqual(JSON.parse(JSON.stringify(args)), { ranges: [0, 4999], rowCount: 5000, firstId: 'id-0', lastId: 'id-4999' });
    assert.ok(JSON.stringify(detail).length > 32 * 1024, 'the whole selection is over the SignalR default');
    assert.ok(JSON.stringify(args).length < 256);
});

test('a selection with gaps is one run per stretch, in row order whatever the click order', () => {
    const sel = [...ids(90, 99), 'id-82', ...ids(0, 79)];
    assert.deepEqual(selectArgs(tableElement(100), { selected: sel }).ranges, [0, 79, 82, 82, 90, 99]);
});

test('a small selection, an unmarked table, another element and an id the table does not have go as they are', () => {
    assert.deepEqual(selectArgs(tableElement(100), { selected: ids(0, 9) }), { selected: ids(0, 9) });
    assert.deepEqual(selectArgs(tableElement(100, false), { selected: ids(0, 99) }), { selected: ids(0, 99) });
    assert.deepEqual(selectArgs({}, { value: 'x' }), { value: 'x' });
    assert.deepEqual(selectArgs(tableElement(100), { selected: [...ids(0, 98), 'gone'] }), { selected: [...ids(0, 98), 'gone'] });
});

// ---- tier namespaces (#768): the tier comes from the element's meta.json (api.json), never from the mapping

test('tier namespaces: every mapped element has one, base elements stay in the root, the old names are aliased', () => {
    const api = JSON.parse(fs.readFileSync(path.join(root, 'core', 'dist', 'elements', 'api.json'), 'utf8'));
    const mapped = fs.readdirSync(path.join(root, 'blazor', 'mappings')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
    const aliases = fs.readFileSync(path.join(generatedDir, 'PkGeneratedAliases.cs'), 'utf8');
    for (const name of mapped) {
        const el = api.find(e => e.tag === 'pk-' + name);
        const ns = tierNamespace(el);
        assert.ok(Object.values(TIER_NAMESPACES).includes(ns), `${name}: ${ns}`);
        const comp = pkName(el.tag), file = path.join(generatedDir, `${comp}.razor`);
        const mapping = JSON.parse(fs.readFileSync(path.join(root, 'blazor', 'mappings', `${name}.json`), 'utf8'));
        assert.equal('tier' in mapping, false, `${name}: the tier is read from core, not from the mapping`);
        if (!fs.existsSync(file)) { // hand-written: its own file says the tier namespace too (the generator refuses a mismatch)
            if (el.tier === 'element') continue; // the root namespace comes from Components/_Imports.razor
            const hand = path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'Components', `${comp}.razor`);
            assert.match(fs.readFileSync(hand, 'utf8'), new RegExp(`^@namespace ${ns.replaceAll('.', '\\.')}\\r?\\n`), comp);
            continue;
        }
        assert.match(fs.readFileSync(file, 'utf8'), new RegExp(`@namespace ${ns.replaceAll('.', '\\.')}\\r?\\n`), comp);
        assert.equal(aliases.includes(`global using ${comp} = ${ns}.${comp};`), el.tier !== 'element' && !mapping.typeparam, `${comp} alias (a generic component cannot be aliased)`);
    }
    assert.throws(() => tierNamespace({ tag: 'pk-x', tier: 'module' }), /no Blazor namespace/);
});

test('the package targets file lists each tier namespace and the old name of each moved component, generic hand-written ones apart (#768)', () => {
    const targets = fs.readFileSync(path.join(generatedDir, 'PlainKit.Blazor.targets'), 'utf8');
    const aliases = fs.readFileSync(path.join(generatedDir, 'PkGeneratedAliases.cs'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(generatedDir, 'generated.manifest.json'), 'utf8'));
    for (const ns of Object.values(TIER_NAMESPACES).filter(n => n !== 'PlainKit.Blazor')) assert.ok(targets.includes(`<Using Include="${ns}" />`), ns);
    assert.ok(!targets.includes('<Using Include="PlainKit.Blazor" />'), 'the root namespace is the consumer\'s own business');
    const fromCs = [...aliases.matchAll(/^global using (\w+) = ([\w.]+);$/gm)].map(m => [m[1], m[2]]);
    const fromTargets = [...targets.matchAll(/<Using Include="([\w.]+)" Alias="(\w+)" \/>/g)].map(m => [m[2], m[1]]);
    assert.ok(fromCs.length > 20);
    assert.deepEqual(fromTargets, fromCs, 'the targets file aliases are the C# aliases of the library');
    for (const c of ['PkTabs', 'PkAppShell', 'PkPageHeader', 'PkDock', 'PkAppBarSearch', 'PkSettingsPage', 'PkToolPage']) assert.ok(fromCs.some(([n]) => n === c), c);
    assert.deepEqual(manifest.movedGeneric, ['PlainKit.Blazor.Components.PkDataTable', 'PlainKit.Blazor.Components.PkFieldGroup', 'PlainKit.Blazor.Pages.PkListPage', 'PlainKit.Blazor.Components.PkLookupPicker', 'PlainKit.Blazor.Pages.PkRecordPage'], 'a generic type cannot be aliased: it needs the namespace using');
    assert.ok(!fromCs.some(([n]) => n === 'PkDataTable' || n === 'PkListPage'));
});

test('a hand-written component must say the namespace of its element\'s tier; a generic one is listed, not aliased (#768)', () => {
    const page = { ...el, tier: 'page' };
    const m = { ...mapping, existing: true };
    const hand = new Set(['PkDemo']);
    assert.throws(() => generate([page], { demo: m }, hand, new Set(), new Map([['PkDemo', { namespace: 'PlainKit.Blazor', generic: false }]])), /@namespace PlainKit\.Blazor\.Pages/);
    const ok = generate([page], { demo: m }, hand, new Set(), new Map([['PkDemo', { namespace: 'PlainKit.Blazor.Pages', generic: false }]]));
    assert.match(ok.files.get('PkGeneratedAliases.cs'), /global using PkDemo = PlainKit\.Blazor\.Pages\.PkDemo;/);
    assert.match(ok.files.get('PlainKit.Blazor.targets'), /<Using Include="PlainKit\.Blazor\.Pages\.PkDemo" Alias="PkDemo" \/>/);
    const generic = generate([page], { demo: m }, hand, new Set(), new Map([['PkDemo', { namespace: 'PlainKit.Blazor.Pages', generic: true }]]));
    assert.doesNotMatch(generic.files.get('PkGeneratedAliases.cs'), /PkDemo/);
    assert.match(generic.files.get('generated.manifest.json'), /PlainKit\.Blazor\.Pages\.PkDemo/);
});
test('callback: a delegate parameter is wired to the element property through a PkCallbackSlot, with an optional result, adapter arguments and abort token', () => {
    const m = { ...mapping, params: [...mapping.params, { name: 'Save', callback: 'save', type: 'Func<IReadOnlyDictionary<string, JsonElement>, Task>?', arg: 'Dictionary<string, JsonElement>', result: false, doc: 'Saves.' },
        { name: 'Load', callback: 'load', type: 'Func<string, CancellationToken, Task<string?>>?', arg: 'Req', args: 'a.Id', abort: true, doc: 'Loads.' }] };
    const r = run(m), razor = r.files.get('PkDemo.razor');
    assert.match(razor, /@implements IDisposable/);
    assert.match(razor, /@using System\.Text\.Json/);
    assert.match(razor, /private readonly PkCallbackSlot _save = new\("save"\);/);
    assert.match(razor, /\/\/\/ <summary>Saves\.<\/summary>\r?\n\s+\[Parameter\] public Func<IReadOnlyDictionary<string, JsonElement>, Task>\? Save/);
    assert.match(razor, /_save\.SyncAsync<Dictionary<string, JsonElement>>\(await Runtime\.BridgeAsync\(Assets\), Element, Save is not null, async a => \{ await Save!\(a\); return null; \}\);/);
    assert.match(razor, /_load\.SyncAsync<Req>\(await Runtime\.BridgeAsync\(Assets\), Element, Load is not null, async \(a, ct\) => \(object\?\)await Load!\(a\.Id, ct\)\);/);
    assert.match(razor, /public void Dispose\(\) \{ _save\.Dispose\(\); _load\.Dispose\(\); \}/);
    assert.ok(!/@implements IDisposable/.test(run().files.get('PkDemo.razor')), 'no callback, no IDisposable');
    const bad = run({ ...mapping, params: [...mapping.params, { name: 'Oops', callback: 'oops', type: 'Func<Task>' }] });
    assert.ok(bad.report.notGenerated.some(n => n.param === 'Oops'), 'a callback without arg and doc is reported, not guessed');
});

test('typeparam: a generic component declares @typeparam, is left out of the using aliases, and a callback can shape its result and ask for a refresh', () => {
    const m = { ...mapping, typeparam: 'TItem', params: [...mapping.params, { name: 'Load', callback: 'load', type: 'Func<Req, Task<Page<TItem>>>?', arg: 'Query', args: 'a.ToRequest()', returns: 'new { rows = r.Items, total = r.Total }', refresh: true, doc: 'Loads.' }] };
    const r = run(m), razor = r.files.get('PkDemo.razor');
    assert.match(razor, /^@namespace [^\n]*\n@typeparam TItem\n/m);
    assert.match(razor, /_load\.SyncAsync<Query>\(await Runtime\.BridgeAsync\(Assets\), Element, Load is not null, async a => \{ var r = await Load!\(a\.ToRequest\(\)\); return new \{ rows = r\.Items, total = r\.Total \}; \}, refresh: true\);/);
    assert.ok(!/@typeparam/.test(run().files.get('PkDemo.razor')), 'no typeparam, no @typeparam');
    assert.ok(!(r.files.get('PkGeneratedAliases.cs') ?? '').includes('PkDemo'), 'a generic component cannot be aliased');
});

test('slotted: a prop is also a light-DOM child of its own (a title that is the heading attribute and a focusable pk-heading), written first, only when set', () => {
    const m = structuredClone(mapping);
    m.params.find(p => p.name === 'Label').slotted = { tag: 'pk-heading', slot: 'title', attrs: { level: '@PkAttr.Num(Count)', weight: 'semibold', tabindex: '-1' } };
    const razor = run(m).files.get('PkDemo.razor');
    assert.match(razor, /label="@Label"/, 'it is still the attribute');
    assert.match(razor, />@if \(!string\.IsNullOrEmpty\(Label\)\) \{<pk-heading slot="title" level="@PkAttr\.Num\(Count\)" weight="semibold" tabindex="-1">@Label<\/pk-heading>\}@ChildContent/, 'and the child comes before the slots, level an expression, the others literals');
    assert.ok(!/pk-heading/.test(run().files.get('PkDemo.razor')), 'a mapping without it draws no child');
});

test('json: true lets a string element prop that holds JSON take a typed record list (PkPageHeader.Crumbs), sent through PkAttr.Json', () => {
    const m = structuredClone(mapping);
    const p = m.params.find(x => x.name === 'Label');
    p.type = 'IReadOnlyList<DemoRow>?'; p.json = true;
    const razor = generate(api, { demo: m }, new Set(), new Set(['DemoRow'])).files.get('PkDemo.razor');
    assert.match(razor, /\[Parameter\] public IReadOnlyList<DemoRow>\? Label/);
    assert.match(razor, /label="@PkAttr\.Json\(Label\)"/);
    delete p.json;
    assert.match(generate(api, { demo: m }, new Set(), new Set(['DemoRow'])).files.get('PkDemo.razor'), /public object\? Label/, 'without json: true a string prop does not take a record list');
});

test('jsonText: a JSON prop takes JSON text or a typed value (object?, sent through PkAttr.JsonText); a bound one reports the text as a string (#1417)', () => {
    const m = structuredClone(mapping);
    const p = m.params.find(x => x.name === 'Label');
    p.type = 'object'; p.jsonText = true; p.default = '{}';
    const razor = run(m).files.get('PkDemo.razor');
    assert.match(razor, /\[Parameter\] public object\? Label \{ get; set; \} = "\{\}";/);
    assert.match(razor, /label="@PkAttr\.JsonText\(Label\)"/);
    delete p.jsonText;
    assert.ok(!/PkAttr\.JsonText/.test(run(m).files.get('PkDemo.razor')), 'without jsonText nothing changes');
});

test('unless: a slot is dropped once another list parameter has items', () => {
    const m = structuredClone(mapping);
    m.params.find(p => p.name === 'AsideContent').unless = 'Rows';
    assert.match(run(m).files.get('PkDemo.razor'), /@if \(AsideContent is not null && Rows is not \{ Count: > 0 \}\) \{<span slot="aside"/);
});

test('shows: a callback that is set turns on a boolean prop; methods: an awaitable call of an element method through the bridge', () => {
    const m = structuredClone(mapping);
    m.params.find(p => p.name === 'OnDismiss').shows = 'open';
    m.methods = [{ name: 'SubmitAsync', method: 'submit' }];
    const e2 = structuredClone(el); e2.methods = [{ name: 'submit()', description: 'Submits.' }];
    const razor = generate([e2], { demo: m }, new Set()).files.get('PkDemo.razor');
    assert.match(razor, /open="@OnDismiss\.HasDelegate"/);
    assert.match(razor, /public Task SubmitAsync\(\) => CallAsync\("submit"\);/);
    assert.throws(() => generate([el], { demo: m }, new Set()), /does not have/);
});

test('stopPropagation: an event parameter marked so stops Blazor bubbling to an enclosing handler (#1427)', () => {
    const m = structuredClone(mapping);
    m.params.find(p => p.name === 'OnDismiss').stopPropagation = true;
    assert.match(run(m).files.get('PkDemo.razor'), /@onpk-dismiss:stopPropagation="true"/);
    assert.doesNotMatch(run(structuredClone(mapping)).files.get('PkDemo.razor'), /stopPropagation/);
});

test('methods: typed arguments and a return value are forwarded to CallAsync (#1375)', () => {
    const m = structuredClone(mapping);
    m.methods = [{ name: 'FocusFieldAsync', method: 'focusField', args: [{ name: 'key', type: 'string' }] }, { name: 'ValidateAllAsync', method: 'validateAll', returns: 'bool' }];
    const e2 = structuredClone(el); e2.methods = [{ name: 'focusField(key)', description: 'Focuses.' }, { name: 'validateAll()', description: 'Checks.' }];
    const razor = generate([e2], { demo: m }, new Set()).files.get('PkDemo.razor');
    assert.ok(razor.includes('public Task FocusFieldAsync(string key) => CallAsync("focusField", key);'));
    assert.ok(razor.includes('public Task<bool> ValidateAllAsync() => CallAsync<bool>("validateAll");'));
});

test('property: a typed parameter for a property with no attribute, set through the bridge after a render only when its JSON changed', () => {
    const m = structuredClone(mapping);
    m.params.push({ name: 'Items', map: 'property', property: 'items', type: 'IReadOnlyList<DemoRow>', doc: 'The rows.' });
    const razor = generate([el], { demo: m }, new Set(), new Set(['DemoRow'])).files.get('PkDemo.razor');
    assert.match(razor, /\[Parameter\] public IReadOnlyList<DemoRow>\? Items \{ get; set; \}/);
    assert.match(razor, /private string\? _sentItems;/);
    assert.match(razor, /var jsonItems = PkAttr\.Json\(Items\);/);
    assert.match(razor, /if \(jsonItems != _sentItems\)/);
    assert.match(razor, /InvokeVoidAsync\("setProperty", Element, "items", jsonItems\)/);
    assert.doesNotMatch(razor, / items="/, 'it is not an attribute');
    const bad = structuredClone(m); delete bad.params.at(-1).doc;
    assert.doesNotMatch(generate([el], { demo: bad }, new Set(), new Set(['DemoRow'])).files.get('PkDemo.razor'), /Items/, 'a property with no doc is skipped');
});

test('ref: a string id parameter for a property that holds an element, resolved by the bridge (setRef) after a render only when it changed (#1389)', () => {
    const m = structuredClone(mapping);
    m.params.push({ name: 'Target', map: 'ref', property: 'target', doc: 'The id of the target.' });
    const razor = generate([el], { demo: m }, new Set()).files.get('PkDemo.razor');
    assert.match(razor, /\[Parameter\] public string\? Target \{ get; set; \}/);
    assert.match(razor, /private string\? _sentTarget;/);
    assert.match(razor, /var jsonTarget = Target;/);
    assert.match(razor, /InvokeVoidAsync\("setRef", Element, "target", jsonTarget\)/);
    assert.doesNotMatch(razor, / target="/, 'it is not an attribute');
    const bad = structuredClone(m); delete bad.params.at(-1).doc;
    assert.doesNotMatch(generate([el], { demo: bad }, new Set()).files.get('PkDemo.razor'), /Target/, 'a ref with no doc is skipped');
});

test('manifest DTOs come from the schema (#364)', () => {
    const cs = real.files.get('PkModuleManifest.cs');
    assert.match(cs, /public sealed record PkModuleManifest/);
    assert.match(cs, /public required string Id \{ get; init; \}/);
    assert.match(cs, /IReadOnlyList<PkManifestNavItem>\? Children/);
});

// ---- "extra": true on an existing mapping (#1407): generated into a partial companion, the hand-written component does not grow

const extraMapping = {
    component: 'PkDemo', existing: true,
    params: [
        { name: 'Label', prop: 'label', type: 'string' },
        { name: 'Count', prop: 'count', type: 'int', extra: true },
        { name: 'Shown', prop: 'open', type: 'bool', extra: true },
        { name: 'OnClose', event: 'pk-close', type: 'EventCallback<PkCloseEventArgs>', extra: true },
        { name: 'OnKey', event: 'click', type: 'EventCallback<MouseEventArgs>', extra: true },
    ],
};
const handInfo = (typeparam) => new Map([['PkDemo', { namespace: 'PlainKit.Blazor', generic: !!typeparam, typeparam }]]);

test('extra entries of an existing mapping become a partial companion with parameters, attributes and handlers; the other entries are left to the hand-written file', () => {
    const r = generate(api, { demo: extraMapping }, new Set(['PkDemo']), new Set(), handInfo('TItem'));
    const cs = r.files.get('PkDemo.Extra.cs');
    assert.match(cs, /^\/\/ Generated by scripts\/generate-blazor\.mjs from the "extra" entries/);
    assert.match(cs, /public partial class PkDemo<TItem>/);
    assert.match(cs, /\[Parameter\] public int Count \{ get; set; \} = 3;/);
    assert.match(cs, /\[Parameter\] public bool Shown \{ get; set; \}/);
    assert.doesNotMatch(cs, /Label/, 'a hand-written entry is not generated');
    assert.match(cs, /protected override void OnParametersSet\(\)/);
    assert.match(cs, /\["count"\] = PkAttr\.Num\(Count\),/);
    assert.match(cs, /\["open"\] = Shown,/);
    assert.match(cs, /if \(OnClose\.HasDelegate\) handlers\["onpk-close"\] = EventCallback\.Factory\.Create<PkCloseEventArgs>\(this, HandlePkClose\);/);
    assert.match(cs, /if \(OnKey\.HasDelegate\) handlers\["onclick"\] = EventCallback\.Factory\.Create<MouseEventArgs>\(this, HandleClick\);/);
    assert.match(cs, /await OnClose\.InvokeAsync\(e\);/);
    assert.match(r.files.get('PkExtras.cs'), /internal static class PkExtras/);
    assert.equal(r.files.has('PkDemo.razor'), false);
    assert.match(r.files.get('PkGeneratedEvents.cs'), /onpk-close/);
});

test('a non-generic hand-written component gets a non-generic partial; no extras means no companion and no helper', () => {
    assert.match(generate(api, { demo: extraMapping }, new Set(['PkDemo']), new Set(), handInfo()).files.get('PkDemo.Extra.cs'), /public partial class PkDemo\r?\n/);
    const none = generate(api, { demo: { ...extraMapping, params: extraMapping.params.filter(p => !p.extra) } }, new Set(['PkDemo']), new Set(), handInfo());
    assert.equal(none.files.has('PkDemo.Extra.cs'), false);
    assert.equal(none.files.has('PkExtras.cs'), false);
});

test('"extrasHook": the hand-written component has its own OnParametersSet, so the companion generates a method it calls instead of an override (#1421)', () => {
    const r = generate(api, { demo: { ...extraMapping, extrasHook: 'ApplyExtras' } }, new Set(['PkDemo']), new Set(), handInfo('TItem'));
    const cs = r.files.get('PkDemo.Extra.cs');
    assert.match(cs, /private void ApplyExtras\(\)/);
    assert.doesNotMatch(cs, /override void OnParametersSet/);
    assert.doesNotMatch(cs, /base\.OnParametersSet/);
    assert.match(cs, /Splat = PkExtras\.Merge\(Splat,/);
});

test('"declared" extra: the hand-written component keeps the parameter and its attribute; only the Changed callback and the bind handler are generated', () => {
    const m = { ...extraMapping, params: [{ name: 'Count', prop: 'count', type: 'int', extra: true, declared: true, bind: { event: 'pk-page', value: 'detail.page' } }] };
    const cs = generate(api, { demo: m }, new Set(['PkDemo']), new Set(), handInfo('TItem')).files.get('PkDemo.Extra.cs');
    assert.match(cs, /\[Parameter\] public EventCallback<int> CountChanged \{ get; set; \}/);
    assert.doesNotMatch(cs, /\[Parameter\] public int Count /);
    assert.doesNotMatch(cs, /\["count"\]/);
    assert.match(cs, /Count = \(int\)\(e\.Page \?\? 0\);\s+await CountChanged\.InvokeAsync\(Count\);/);
    assert.match(cs, /handlers\["onpk-page"\] = /);
});

test('the real PkDataTable is generated (#1473) and binds SortKey, Descending, Search and PageSize on pk-query-change (#1431)', () => {
    const cs = real.files.get('PkDataTable.razor');
    assert.equal(real.files.has('PkDataTable.Extra.cs'), false);
    for (const n of ['SortKey', 'Descending', 'Search', 'PageSize']) assert.match(cs, new RegExp(`${n}Changed \\{ get; set; \\}`), n);
    assert.match(cs, /handlers\["onpk-query-change"\]/);
});

test('the real PkDataTable keeps its typed surface: required Load, Columns and IdOf, plain OnAdd, a listened OnNavigate, its slots, load, select and row click', () => {
    const razor = real.files.get('PkDataTable.razor');
    assert.match(razor, /@typeparam TItem/);
    for (const n of ['Load', 'Columns', 'IdOf']) assert.match(razor, new RegExp(`\\[Parameter, EditorRequired\\] public .+ ${n} \\{ get; set; \\}`), n);
    assert.match(razor, /public string EmptyText \{ get; set; \} = "Nothing to show\.";/);
    assert.match(razor, /public int\[\]\? PageSizeOptions \{ get; set; \} = \[10, 25, 50, 100\];/);
    assert.match(razor, /public bool Searchable \{ get; set; \} = true;/);
    assert.match(razor, /hide-search="@\(!Searchable\)"/);
    assert.match(razor, /sort-dir="@\(Descending \? "descending" : "ascending"\)"/);
    assert.match(razor, /public EventCallback OnAdd \{ get; set; \}/);
    assert.match(razor, /if \(OnNavigate\.HasDelegate\) handlers\["onpk-navigate"\]/);
    assert.match(razor, /<div slot="empty" class="u-contents">@EmptyContent<\/div>/);
    assert.match(razor, /clickable="@OnRowClick\.HasDelegate"/);
    assert.match(razor, /cell-\{row\.Id\}-\{column\.Key\}/);
    assert.match(razor, /header-\{c\.Key\}/);
    assert.match(razor, /_load\.SyncAsync<PkListPageQuery>/);
    assert.match(razor, /handlers\["onpk-select"\]/);
    assert.match(razor, /handlers\["onpk-row-click"\]/);
});

test('"extra" on a component that is not hand-written is an error: it is generated whole', () => {
    assert.throws(() => generate(api, { demo: extraMapping }, new Set(), new Set(), new Map()), /extra.*exist by hand/);
});

test('the real PkLookupPicker is generated: typed columns, keyed load rows, typed Values, listened native events', () => {
    const razor = real.files.get('PkLookupPicker.razor');
    assert.match(razor, /@typeparam TItem/);
    assert.match(razor, /columns="@PkAttr\.Json\(Columns\.Select\(c => c\.ToColumn\(\)\)\)"/);
    assert.match(razor, /n\["id"\] = IdOf!\(i\); n\["pkLabel"\] = \(LabelOf \?\? IdOf!\)\(i\)/);
    assert.match(razor, /Values = e\.Values \?\? \[\];/);
    for (const n of ['Description', 'SearchDebounce', 'OnInput', 'OnChange']) assert.match(razor, new RegExp(`public \\S+ ${n} \\{ get; set; \\}`), n);
    assert.match(razor, /search-debounce="@PkAttr\.Num\(SearchDebounce\)"/);
    assert.match(razor, /if \(OnInput\.HasDelegate\) handlers\["oninput"\]/);
});

test('"location": the component tracks NavigationManager and sends the path unless the parameter is set; the subscription is disposed (#805)', () => {
    const m = { ...mapping, params: [{ name: 'Path', prop: 'label', type: 'string?' }], location: { param: 'Path', prop: 'label' } };
    const razor = run(m).files.get('PkDemo.razor');
    assert.match(razor, /@implements IDisposable/);
    assert.match(razor, /label="@\(Path \?\? _locationPath\)"/);
    assert.match(razor, /LocationNav\.LocationChanged \+= HandleLocationChanged;/);
    assert.match(razor, /if \(Path is null\) InvokeAsync\(StateHasChanged\);/);
    assert.match(razor, /void Dispose\(\) \{\s+LocationNav\.LocationChanged -= HandleLocationChanged;/);
    assert.throws(() => run({ ...m, location: { param: 'Path', prop: 'nothing' } }), /not a generated attribute/);
    const c = run({ ...mapping, params: [{ name: 'Open', prop: 'open', type: 'bool', bind: { event: 'pk-toggle', value: 'detail.open' } }], location: { closes: 'Open' } }).files.get('PkDemo.razor');
    assert.match(c, /if \(!Open\) return;/);
    assert.match(c, /OpenChanged\.InvokeAsync\(false\)/);
    assert.doesNotMatch(run().files.get('PkDemo.razor'), /LocationNav/);
});
