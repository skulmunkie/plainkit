// The development server (tools/serve.mjs) attacked over a raw socket (a URL parser would tidy the paths a browser never sends): path traversal in its
// encodings, a sibling folder that shares the SDK folder's name prefix, a malformed escape, a foreign Host header (DNS rebinding) and a cross-site POST
// to the report writer. Nothing outside core/ may be read, and the server must survive every request.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './needs-bootstrap.mjs';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sibling = `${core}-pk-sibling-${process.pid}`;
const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

// One raw HTTP/1.1 request; resolves { status, body } (or { status: 0 } when the connection dies without a response).
const raw = (port, requestLine, headers = {}, body = '') => new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    let data = '';
    const h = { host: `localhost:${port}`, connection: 'close', ...headers };
    socket.on('connect', () => socket.write(`${requestLine} HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n${body}`));
    socket.on('data', c => { data += c; });
    socket.on('error', () => resolve({ status: 0, body: '' }));
    socket.on('close', () => resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(data)?.[1] ?? 0), body: data.split('\r\n\r\n').slice(1).join('\r\n\r\n') }));
});

async function withServer(args, run) {
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'secret.txt'), 'SIBLING-SECRET');
    const port = await freePort();
    const proc = spawn(process.execPath, [path.join(core, 'tools', 'serve.mjs'), String(port), ...args], { stdio: 'ignore' });
    try {
        for (let i = 0; ; i++) {
            if ((await raw(port, 'GET /plainkit.css')).status === 200) break;
            if (i > 60) throw new Error('the server did not start');
            await new Promise(r => setTimeout(r, 100));
        }
        await run(port);
        assert.equal((await raw(port, 'GET /plainkit.css')).status, 200, 'the server is still serving after the attacks');
    } finally { proc.kill(); fs.rmSync(sibling, { recursive: true, force: true }); }
}

test('path traversal: dot segments, encodings and a sibling folder with the same prefix never leave the SDK folder', async () => {
    const name = path.basename(sibling);
    const targets = [
        `/../${name}/secret.txt`, `/..%2f${name}/secret.txt`, `/%2e%2e/${name}/secret.txt`, `/%2e%2e%2f${name}/secret.txt`, `/..\\${name}\\secret.txt`, `/..%5c${name}%5csecret.txt`,
        `/..%2fAGENTS.md`, `/..%2f..%2fAGENTS.md`, `/%2e%2e/%2e%2e/AGENTS.md`, `/....//....//AGENTS.md`, `//../AGENTS.md`,
        '/plainkit.css%00.js', '/%00', `/${'..%2f'.repeat(30)}Windows/win.ini`, `/${'..%2f'.repeat(30)}etc/passwd`,
    ];
    await withServer([], async port => {
        for (const t of targets) {
            const r = await raw(port, `GET ${t}`);
            assert.ok(!r.body.includes("SIBLING-SECRET") && !r.body.includes("Agents working on Plainkit"), `${t} served a file from outside the SDK folder`);
            assert.ok(r.status !== 200, `${t} answered 200`);
        }
    });
});

test('a malformed percent escape is a 400, not a crash of the server', async () => {
    await withServer([], async port => {
        assert.equal((await raw(port, 'GET /%E0%A4%A')).status, 400);
        assert.equal((await raw(port, 'GET /%')).status, 400);
    });
});

test('the server answers only requests for a local host name (DNS rebinding), unless --host says otherwise', async () => {
    await withServer([], async port => {
        assert.equal((await raw(port, 'GET /plainkit.css', { host: 'evil.example:80' })).status, 403);
        assert.equal((await raw(port, 'GET /plainkit.css', { host: `127.0.0.1:${port}` })).status, 200);
        assert.equal((await raw(port, 'GET /plainkit.css', { host: `[::1]:${port}` })).status, 200);
    });
});

test('with --write-reports, a report is written only by a same-origin request: a cross-site page cannot overwrite the browser attestation', async () => {
    const report = path.join(core, 'tests', 'browser', 'report.json');
    const before = fs.readFileSync(report, 'utf8');
    try {
        await withServer(['--write-reports'], async port => {
            const body = JSON.stringify({ hostile: true });
            const post = origin => raw(port, 'POST /__report?kind=browser', { 'content-type': 'text/plain', 'content-length': Buffer.byteLength(body), ...(origin ? { origin } : {}) }, body);
            assert.equal((await post('http://evil.example')).status, 403);
            assert.equal(fs.readFileSync(report, 'utf8'), before, 'a cross-site POST changed report.json');
        });
    } finally { fs.writeFileSync(report, before); } // never leave the attestation damaged, even when the server is not fixed
});
