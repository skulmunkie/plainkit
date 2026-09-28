// The generator's mapping "events" list and bind "field": a callback for every element event, and several two-way parameters from one event.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../generate-blazor.mjs';

const el = {
    tag: 'pk-evdemo', summary: 'Demo.',
    props: [{ name: 'start', type: 'string' }, { name: 'end', type: 'string' }],
    slots: [],
    events: [
        { name: 'pk-range', detail: '{ start: string, end: string }', detailProps: { start: 'string', end: 'string' }, description: 'Range.' },
        { name: 'pk-ping', detail: null, description: 'Ping.' },
        { name: 'pk-move', detail: '{ item: string }', detailProps: { item: 'string' }, cancelable: true, description: 'Moved.' },
        { name: 'click', detail: 'native MouseEvent', description: 'Clicked.' },
    ],
};
const base = [{ name: 'Start', prop: 'start', type: 'string' }, { name: 'End', prop: 'end', type: 'string' }];
const map = extra => ({ component: 'PkEvdemo', params: base, ...extra });
const run = m => generate([el], { evdemo: m }).files.get('PkEvdemo.razor');

test('events: a listed event gets an On<Event> callback typed from its detail; native events are never generated', () => {
    const razor = run(map({ events: ['pk-move', 'pk-ping'] }));
    assert.match(razor, /\[Parameter\] public EventCallback<PkMoveEventArgs> OnMove/);
    assert.match(razor, /\[Parameter\] public EventCallback OnPing/);
    assert.match(razor, /await OnMove\.InvokeAsync\(e\);/);
    assert.match(razor, /await OnPing\.InvokeAsync\(\);/);
    assert.match(razor, /\["onpk-move"\] = EventCallback\.Factory\.Create<PkMoveEventArgs>\(this, HandlePkMove\)/);
    assert.doesNotMatch(razor, /OnRange|OnClick/);
});

test('events: "pk" lists every pk-* event of the element', () => {
    const razor = run(map({ events: 'pk' }));
    for (const n of ['OnRange', 'OnPing', 'OnMove']) assert.match(razor, new RegExp(`public EventCallback(<\\w+>)? ${n} `));
    assert.doesNotMatch(razor, /OnClick/);
});

test('events: an event with its own parameter is left to it; an unknown event or a clashing name is an error', () => {
    const razor = run(map({ events: 'pk', params: [...base, { name: 'OnMoved', event: 'pk-move', type: 'EventCallback<PkMoveEventArgs>' }] }));
    assert.match(razor, /OnMoved/);
    assert.doesNotMatch(razor, / OnMove /);
    assert.throws(() => run(map({ events: ['pk-nope'] })), /does not have/);
    assert.throws(() => run(map({ events: ['pk-ping'], params: [...base, { name: 'OnPing', prop: 'start', type: 'string' }] })), /already has a parameter/);
});

test('bind: two parameters follow two fields of one event, each with its own Changed callback (bind.field)', () => {
    const razor = run(map({ params: [
        { name: 'Start', prop: 'start', type: 'string', bind: { event: 'pk-range', field: 'start' } },
        { name: 'End', prop: 'end', type: 'string', bind: { event: 'pk-range', field: 'end' } },
    ] }));
    assert.match(razor, /Start = e\.Start;/);
    assert.match(razor, /End = e\.End;/);
    assert.match(razor, /EventCallback<string\?> StartChanged/);
    assert.match(razor, /EventCallback<string\?> EndChanged/);
    assert.match(razor, /await StartChanged\.InvokeAsync\(Start\);[\s\S]*await EndChanged\.InvokeAsync\(End\);/);
});
