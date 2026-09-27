// Generic "put some JSON-safe state in a shareable link" codec: no DOM, no app knowledge, text in and text out. A consumer supplies its own
// key (the query-ish name before '='), an already-serialised payload string to encode, and (to decode) a validator that turns the decoded
// text back into its own shape. Compresses with deflate-raw via CompressionStream when the platform has it, falls back to plain base64url
// otherwise, and caps both the encoded link length and the decompressed size so a short link can never expand into an unbounded one.
//
//   await encodeShareLink(key, text, { maxHash, compress })   { hash, compressed } | { error }: '<key>=z.<base64url>' or '<key>=p.<base64url>'
//   await decodeShareLink(key, hashOrUrl, { maxHash, maxDecoded, validate })   validate(text) => value | { error }; result is { value } | { error }
//
// `core/js/theme-share-logic.js` is the theme editor's glue on top of this: its own payload shape, its own `readImport` validation, its own
// wording for "there is nothing to share".

import { createLogger } from './log.js';
const log = createLogger('share-link');

export const DEFAULT_MAX_HASH = 4096;        // characters of the link fragment after the #
export const DEFAULT_MAX_DECODED = 100000;   // bytes of text a link may expand to

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

function toB64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(text) {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('the link has characters a share link never contains');
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
        if (size > cap) { await reader.cancel(); throw new Error('the link expands to more than is allowed'); }
        out.push(value);
    }
    await written;
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of out) { all.set(c, at); at += c.length; }
    return all;
}

export const hasCompression = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// text is already-serialised (typically JSON.stringify of the caller's payload).
export async function encodeShareLink(key, text, { maxHash = DEFAULT_MAX_HASH, compress = hasCompression(), tooLarge = (length, max) => `This is too large for a link (${length} of ${max} characters).` } = {}) {
    const json = enc.encode(text);
    const packed = compress && hasCompression() ? `z.${toB64(await pipe(json, new CompressionStream('deflate-raw')))}` : `p.${toB64(json)}`;
    const hash = `${key}=${packed}`;
    if (hash.length > maxHash) return { error: tooLarge(hash.length, maxHash) };
    return { hash, compressed: packed.startsWith('z.') };
}

// Accepts the fragment ('#key=z....', 'key=...') or a whole URL. `validate(text)` turns the decoded text into the caller's shape; it may
// return `{ error }` to refuse it, or the value itself (which is handed back as `{ value }`).
export async function decodeShareLink(key, input, { maxHash = DEFAULT_MAX_HASH, maxDecoded = DEFAULT_MAX_DECODED, validate = text => text } = {}) {
    const raw = String(input ?? '').trim();
    const at = raw.indexOf(`${key}=`);
    if (at < 0) return { error: 'That is not a recognised share link.' };
    const packed = raw.slice(at + key.length + 1);
    if (packed.length > maxHash) return { error: 'That link is longer than a share link can be.' };
    const kind = packed.slice(0, 2);
    if (kind !== 'z.' && kind !== 'p.') return { error: 'That is not a recognised share link.' };
    if (kind === 'z.' && !hasCompression()) return { error: 'This browser cannot open a compressed share link (no DecompressionStream).' };
    let text;
    try {
        const bytes = fromB64(packed.slice(2));
        text = dec.decode(kind === 'z.' ? await pipe(bytes, new DecompressionStream('deflate-raw'), maxDecoded) : bytes);
        if (text.length > maxDecoded) return { error: 'The link expands to more than is allowed.' };
    } catch (error) {
        return { error: `The link could not be read: ${error.message || 'it is damaged'}.` };
    }
    let result;
    try { result = validate(text); } catch (error) { return { error: `The link could not be read: ${error.message}.` }; }
    if (result && typeof result === 'object' && 'error' in result) return { error: result.error };
    return { value: result };
}
