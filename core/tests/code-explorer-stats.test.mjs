import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statsReport } from '../modules/code-explorer/reports.js';

const file = (path, text) => ({ path, lines: text.split('\n') });

test('statsReport totals files and lines, by top-level folder and by extension', () => {
    const r = statsReport([file('src/a.js', 'one\ntwo\nthree'), file('src/b.js', 'x'), file('docs/g.md', 'a\nb'), file('README.md', 'z')]);
    assert.equal(r.files, 4);
    assert.equal(r.lines, 7);
    assert.deepEqual(r.folders, [{ name: 'src', files: 2, lines: 4 }, { name: 'docs', files: 1, lines: 2 }, { name: '(root)', files: 1, lines: 1 }]);
    assert.deepEqual(r.languages, [{ name: 'js', files: 2, lines: 4 }, { name: 'md', files: 2, lines: 3 }]);
    assert.deepEqual(r.largest[0], { path: 'src/a.js', lines: 3 });
});

test('statsReport ranks declared types by how often other places name them', () => {
    const r = statsReport([
        file('A.cs', 'public class Widget\n{\n}\npublic class Lonely\n{\n}'),
        file('B.cs', 'public class User\n{\n    Widget w; Widget v;\n}'),
        file('C.js', 'class Gadget {}\nnew Widget(); new Gadget();'),
    ]);
    assert.deepEqual(r.types.map(t => [t.name, t.refs]), [['Widget', 3], ['Gadget', 1]]);
    assert.deepEqual([r.types[0].path, r.types[0].line], ['A.cs', 1]);
});

test('statsReport copes with no files, and caps the lists at ten', () => {
    assert.deepEqual(statsReport([]), { files: 0, lines: 0, folders: [], languages: [], largest: [], types: [] });
    const many = Array.from({ length: 15 }, (_, i) => file(`f${i}.txt`, 'x\n'.repeat(i + 1)));
    assert.equal(statsReport(many).largest.length, 10);
});
