// The theme editor's export and share formats (modules/theme-editor). No DOM: text in, text out (CompressionStream is used when the platform has it).
//
//   buildSnippet(overrides)             the override CSS with a header comment: the :root / [data-theme] blocks, ready to paste after the SDK stylesheets
//   await encodeShare(overrides)        { hash } | { error }: 'pk-theme=z.<base64url>' (deflate-raw) or 'pk-theme=p.<base64url>' (plain, no CompressionStream)
//   await decodeShare(hashOrUrl)        { overrides } | { error }: the same rules as pasting JSON into the import box (readImport), and text only
//
// A link is data, never markup: the payload is JSON that readImport sanitises name by name and value by value (the SDK's rules: no url(), no comments,
// no markup characters), the encoded text is size-limited, and a compressed payload is read with a cap so a small link cannot expand into a large one.

import { buildOverrides } from './theme.js';
import { readImport, overrideCount } from './theme-editor-logic.js';
import { createLogger } from './log.js';
const log = createLogger('theme-share');

export const SHARE_KEY = 'pk-theme';
export const MAX_HASH = 4096;        // characters of the link fragment after the #
export const MAX_DECODED = 100000;   // bytes of JSON a link may expand to

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

export function buildSnippet(overrides) {
    const { css } = buildOverrides(overrides);
    return `/* Plainkit theme: ${overrideCount(overrides)} token override${overrideCount(overrides) === 1 ? '' : 's'}. Save as theme.css and load it after the SDK stylesheets. */\n${css}`;
}

function toB64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(text) {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('the link has characters a theme link never contains');
    const b = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, c => c.charCodeAt(0));
}

async function pipe(bytes, stream, cap = Infinity) {
    const out = [];
    let size = 0;
    const writer = stream.writable.getWriter();
    const written = writer.write(bytes).then(() => writer.close());
    written.catch(error => log.debug('the write side of the stream stopped (it is thrown below unless the read was cut off on purpose)', error));
    const reader = stream.readable.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > cap) { await reader.cancel(); throw new Error('the link expands to more than a theme can be'); }
        out.push(value);
    }
    await written;
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of out) { all.set(c, at); at += c.length; }
    return all;
}

const hasCompression = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// The compact JSON of only the sections that hold something, so an empty theme is a short link.
const payloadOf = overrides => JSON.stringify(Object.fromEntries(['shared', 'dark', 'light'].filter(k => Object.keys(overrides[k]).length).map(k => [k, overrides[k]])));

export async function encodeShare(overrides, { compress = hasCompression() } = {}) {
    if (overrideCount(overrides) === 0) return { error: 'There is nothing to share: no token differs from the stylesheet.' };
    const json = enc.encode(payloadOf(overrides));
    const packed = compress && hasCompression() ? `z.${toB64(await pipe(json, new CompressionStream('deflate-raw')))}` : `p.${toB64(json)}`;
    const hash = `${SHARE_KEY}=${packed}`;
    if (hash.length > MAX_HASH) return { error: `This theme is too large for a link (${hash.length} of ${MAX_HASH} characters): export the CSS instead.` };
    return { hash, compressed: packed.startsWith('z.') };
}

// Accepts the fragment ('#pk-theme=z....', 'pk-theme=...') or a whole URL.
export async function decodeShare(input) {
    const raw = String(input ?? '').trim();
    const at = raw.indexOf(`${SHARE_KEY}=`);
    if (at < 0) return { error: 'That is not a Plainkit theme link.' };
    const packed = raw.slice(at + SHARE_KEY.length + 1);
    if (packed.length > MAX_HASH) return { error: 'That link is longer than a theme link can be.' };
    const kind = packed.slice(0, 2);
    if (kind !== 'z.' && kind !== 'p.') return { error: 'That is not a Plainkit theme link.' };
    if (kind === 'z.' && !hasCompression()) return { error: 'This browser cannot open a compressed theme link (no DecompressionStream).' };
    let text;
    try {
        const bytes = fromB64(packed.slice(2));
        text = dec.decode(kind === 'z.' ? await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_DECODED) : bytes);
        if (text.length > MAX_DECODED) return { error: 'The link expands to more than a theme can be.' };
    } catch (error) {
        return { error: `The link could not be read: ${error.message || 'it is damaged'}.` };
    }
    let read;
    try { read = readImport(text); } catch (error) { return { error: `The link does not hold a theme: ${error.message}.` }; }   // readImport parses JSON and throws on text that is not
    return read.error ? { error: read.error } : { overrides: read.overrides };
}
