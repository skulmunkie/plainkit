// Which addresses an element may turn into a link, a navigation or a frame. Pure, no DOM. A page address that comes from data (a database row, a query
// string, a Razor parameter) must never become a script: a script address (java + script + colon) in an href runs in the page origin when it is followed.
//
// The URL parser ignores tabs and newlines inside a URL and strips control characters and spaces around it, so a leading space or a newline inside the scheme
// does not hide a script address: the scheme is read after they are removed, and the address is used as it was written (never rewritten).

const STRIP = /[\x00-\x20\x7f-\x9f\u{2028}\u{2029}]/gu;

/** The lower-case scheme of an address as the browser will read it, or null for a relative address (a path, a query, a fragment). */
export const schemeOf = url => /^([a-z][a-z0-9+.-]*):/i.exec(String(url ?? '').replace(STRIP, ''))?.[1].toLowerCase() ?? null;

/** True for a same-site (relative) address or one whose scheme is in `schemes`. */
export const isSafeUrl = (url, schemes) => typeof url === 'string' && url.trim() !== '' && (schemeOf(url) === null || schemes.includes(schemeOf(url)));

/** An address to navigate to: a same-site path or http(s). The address itself, or null. */
export const safeLink = url => (isSafeUrl(url, ['http', 'https']) ? url : null);

/** An address for an anchor's href: what safeLink allows, and mailto, tel and sms. The address itself, or null. */
export const safeHref = url => (isSafeUrl(url, ['http', 'https', 'mailto', 'tel', 'sms']) ? url : null);
