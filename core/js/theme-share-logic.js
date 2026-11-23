// The theme editor's export and share formats (modules/theme-editor), built on the generic link codec (js/share-link.js). No DOM: text in, text out.
//
//   buildSnippet(overrides)             the override CSS with a header comment: the :root / [data-theme] blocks, ready to paste after the SDK stylesheets
//   await encodeShare(overrides)        { hash } | { error }: 'pk-theme=z.<base64url>' (deflate-raw) or 'pk-theme=p.<base64url>' (plain, no CompressionStream)
//   await decodeShare(hashOrUrl)        { overrides } | { error }: the same rules as pasting JSON into the import box (readImport), and text only
//
// A link is data, never markup: the payload is JSON that readImport sanitises name by name and value by value (the SDK's rules: no url(), no comments,
// no markup characters), the encoded text is size-limited, and a compressed payload is read with a cap so a small link cannot expand into a large one.
// This module is theme-shaped glue only; the codec itself (compress, base64url, the size caps) is generic and lives in js/share-link.js so any
// consumer app can share its own JSON-safe state (a filter, a draft, a configuration) the same way.

import { buildOverrides } from './theme.js';
import { overrideCount } from './theme-editor-logic.js';
import { readDocument, writeDocument } from './theme-document-logic.js';
import { encodeShareLink, decodeShareLink, DEFAULT_MAX_HASH, DEFAULT_MAX_DECODED } from './share-link.js';

export const SHARE_KEY = 'pk-theme';
export const MAX_HASH = DEFAULT_MAX_HASH;        // characters of the link fragment after the #
export const MAX_DECODED = DEFAULT_MAX_DECODED;  // bytes of JSON a link may expand to

export function buildSnippet(overrides) {
    const { css } = buildOverrides(overrides);
    return `/* Plainkit theme: ${overrideCount(overrides)} token override${overrideCount(overrides) === 1 ? '' : 's'}. Save as theme.css and load it after the SDK stylesheets. */\n${css}`;
}

// The compact JSON of only the sections that hold something, so an empty theme is a short link.
const payloadOf = overrides => JSON.stringify(Object.fromEntries(Object.entries(writeDocument(overrides)).filter(([k, v]) => k === 'version' || Object.keys(v).length)));

export async function encodeShare(overrides, options = {}) {
    if (overrideCount(overrides) === 0) return { error: 'There is nothing to share: no token differs from the stylesheet.' };
    return encodeShareLink(SHARE_KEY, payloadOf(overrides), {
        maxHash: MAX_HASH,
        tooLarge: (length, max) => `This theme is too large for a link (${length} of ${max} characters): export the CSS instead.`,
        ...options,
    });
}

// Accepts the fragment ('#pk-theme=z....', 'pk-theme=...') or a whole URL.
export async function decodeShare(input) {
    const r = await decodeShareLink(SHARE_KEY, input, {
        maxHash: MAX_HASH,
        maxDecoded: MAX_DECODED,
        validate(text) {
            const read = readDocument(text);   // the same reader as pasted JSON: sections, version and values are checked there
            return read.error ? { error: read.error } : read.doc.overrides;
        },
    });
    return r.error ? r : { overrides: r.value };
}
