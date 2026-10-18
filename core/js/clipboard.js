// Shared clipboard helpers for the code elements: an async copy and the announce-and-emit step that follows it.

// Copy text with the async clipboard when there is one; resolves true on success, false when copying is unavailable or refused.
export async function copyText(text, clipboard = globalThis.navigator?.clipboard) {
    if (!clipboard?.writeText) return false;
    try { await clipboard.writeText(text); return true; } catch { return false; }
}

// Copy `text` for `host`: say "Copied" or "Copy failed" in its polite `status` region for two seconds and emit pk-copy { ok }.
export async function copyAndAnnounce(host, text) {
    const ok = await copyText(text), status = host.part('status');
    status.textContent = ok ? 'Copied' : 'Copy failed';
    host.emit('pk-copy', { ok }, { cancelable: false });
    clearTimeout(host.$t); host.$t = setTimeout(() => { status.textContent = ''; }, 2000);
    return ok;
}
