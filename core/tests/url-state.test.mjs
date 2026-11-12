// The naming and parse of the list's view in the address (#1946): a fixed contract, so a host can build /rows?q=ebay&f.channel=ebay&page=3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readQuery, writeQuery } from '../js/url-state.js';

const def = { sort: null, sortDir: 'ascending' };

test('readQuery: q, sort, desc, page and f.<key> (a repeated key is a list); a prefix selects one list; nothing is {}', () => {
    assert.deepEqual(readQuery('?q=a&sort=name&desc=1&page=3&f.channel=ebay&f.tag=x&f.tag=y&other=1', ''), { search: 'a', sort: 'name', sortDir: 'descending', page: 3, filters: { channel: 'ebay', tag: ['x', 'y'] } });
    assert.deepEqual(readQuery('?a.page=2&b.q=x&page=9', 'a'), { page: 2 });
    assert.deepEqual(readQuery('?x=1', ''), {});
    assert.deepEqual(readQuery('?page=0&page=abc', ''), {}, 'a bad page is ignored');
});

test('writeQuery: defaults are omitted, other parameters and the hash are kept, the size is never written, a prefix names its own', () => {
    const url = 'https://x.test/rows?x=1&q=old&page=5&a.q=keep#h';
    assert.equal(writeQuery(url, '', { search: '', page: 1, pageSize: 50, sort: null, sortDir: 'ascending', filters: { channel: '' } }, def).search, '?x=1&a.q=keep');
    const u = writeQuery(url, '', { search: 'ebay', page: 3, sort: 'name', sortDir: 'descending', filters: { channel: 'etsy', tag: ['x', 'y'] } }, def);
    assert.equal(u.search, '?x=1&a.q=keep&q=ebay&sort=name&desc=1&page=3&f.channel=etsy&f.tag=x&f.tag=y');
    assert.equal(u.hash, '#h');
    assert.equal(writeQuery('https://x.test/r', 'a', { search: 'z', page: 2, filters: {} }, def).search, '?a.q=z&a.page=2');
    assert.equal(writeQuery('https://x.test/r', '', { search: '', page: 1, sort: 'name', sortDir: 'ascending', filters: {} }, { sort: 'name', sortDir: 'ascending' }).search, '', 'the host default sort is omitted');
});
