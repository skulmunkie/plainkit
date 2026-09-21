// The secret scanner (scripts/secret-scan.mjs): each rule fires on a credential-shaped line (assembled at run time so this file is not itself a hit), stays quiet on
// placeholders and references, and the repository's tracked files carry no secret. Run: node --test scripts/tests/secret-scan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanLine, scanText, scanTree, RULES } from '../secret-scan.mjs';

const rand = (n, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789') => Array.from({ length: n }, (_, i) => alphabet[(i * 7 + 3) % alphabet.length]).join('');
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const FIXTURES = {
    'private-key': `-----BEGIN ${'RSA '}PRIVATE KEY-----`,
    'aws-access-key': `key = ${'AKIA'}${rand(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')}`,
    'github-token': `token: ${'ghp_'}${rand(36, ALNUM)}`,
    'npm-token': `//registry.npmjs.org/:_authToken=${'npm_'}${rand(36, ALNUM)}`,
    'nuget-api-key': `--api-key ${'oy2'}${rand(43)}`,
    'slack-token': `${'xoxb'}-${rand(12, '0123456789')}-${rand(12, ALNUM)}`,
    'google-api-key': `${'AIza'}${rand(35, ALNUM)}`,
    'openai-style-key': `${'sk-'}${rand(40, ALNUM)}`,
    jwt: `${'eyJ'}${rand(20, ALNUM)}.${'eyJ'}${rand(20, ALNUM)}.${rand(20, ALNUM)}`,
    'connection-string-password': 'Server=db;Database=app;User Id=sa;Password=Tr0ub4dor&3xyz;', // secret-scan:allow
    'url-with-credentials': 'origin = https://deploy:Zk93pQ7wLm@git.internal.test/repo.git', // secret-scan:allow
    'credential-assignment': 'const apiKey = "' + rand(24, ALNUM) + '";',
};

test('every rule has a fixture and fires on it', () => {
    assert.deepEqual(Object.keys(FIXTURES).sort(), RULES.map(r => r.id).sort());
    for (const [id, line] of Object.entries(FIXTURES)) assert.ok(scanLine(line).some(h => h.rule === id), `${id} did not fire on ${line}`);
});

test('a hit never prints the secret itself', () => {
    const line = FIXTURES['github-token'];
    const secret = /ghp_\w+/.exec(line)[0];
    for (const h of scanLine(line)) assert.ok(!h.excerpt.includes(secret) && h.excerpt.includes('*'));
});

test('placeholders, environment references and marked fixtures are not hits', () => {
    for (const quiet of [
        'password: "<your password here>"', 'const apiKey = process.env.API_KEY_FROM_THE_ENVIRONMENT;', 'api-key: ${{ steps.nuget-login.outputs.NUGET_API_KEY }}',
        'NPM_TOKEN: ${{ secrets.NPM_TOKEN }}', 'Password=changeme123;', 'https://user:password@example.com/', 'secret = "hunter2hunter2hunter2"',
        `${FIXTURES['github-token']} // secret-scan:allow`, 'password:', 'const password = ask();',
    ]) assert.deepEqual(scanLine(quiet), [], quiet);
});

test('scanText reports the line number', () => {
    assert.deepEqual(scanText(`fine\r\nalso fine\r\n${FIXTURES['private-key']}\r\n`).map(h => [h.line, h.rule]), [[3, 'private-key']]);
});

test('no tracked file in the repository looks like a credential', () => {
    assert.deepEqual(scanTree().map(h => `${h.rule} ${h.where}`), []);
});
