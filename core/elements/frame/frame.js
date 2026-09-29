// <pk-frame> behaviour and its pure logic: a sandboxed iframe (srcdoc or src) with width presets and a theme hand-off.
//
// Sandbox: the default is the minimal token that still lets a cooperating document run ("allow-scripts" alone) - no allow-same-origin,
// no allow-popups, no allow-forms, no allow-top-navigation. A consumer widens `sandbox` for its own case; allow-same-origin is only ever
// added when `allowSameOrigin` is explicitly set, because allow-same-origin + allow-scripts together let the framed document remove its
// own sandbox (https://developer.mozilla.org/docs/Web/HTML/Element/iframe#sandbox).
//
// Theme hand-off: the SIMPLEST safe contract with a cooperating document, never assuming it can be reached (a sandboxed frame without
// allow-same-origin has an opaque origin, so its contentDocument is not reachable from here):
//   1. a same-origin `src` gets `?pk-theme=light|dark` appended before it is loaded, so the initial render can read it server- or
//      client-side (light/dark are the only skins the query param passes; "inherit" sends nothing);
//   2. after load, and again whenever `theme` changes, `{ type: "pk-theme", theme }` is posted to the frame (postMessage crosses a
//      sandboxed, opaque origin - it is not a DOM read). A `srcdoc` document only ever gets the message, since it has no URL of its own.
//   A cooperating document listens with `window.addEventListener("message", e => { if (e.data?.type === "pk-theme") ... })` and reads
//   `new URLSearchParams(location.search).get("pk-theme")` for the value at first paint.
// Resize: with `height="auto"` (the default) the frame keeps a fallback height until a cooperating document posts
//   `{ type: "pk-frame-resize", height }` (its own scrollHeight); this element never reads the framed document itself.
import { safeLink } from '../../js/safe-url.js';
import { breakpoint } from '../../js/breakpoints.js';

const DEFAULT_SANDBOX = 'allow-scripts';
// preset -> named breakpoint (tokens/breakpoints.json); "desktop" reads the widest named breakpoint. "full" has no cap.
const PRESET_BREAKPOINT = { phone: 'phone', tablet: 'tablet', desktop: 'wide' };

// The sandbox token string to set: allow-same-origin is dropped unless allowed is true (then it is always present). warn() is called
// once when a combination was rejected, so the caller can log it.
export function resolveSandbox(sandbox, allowed, warn) {
    const tokens = new Set(String(sandbox || DEFAULT_SANDBOX).trim().split(/\s+/).filter(Boolean));
    if (allowed) tokens.add('allow-same-origin');
    else if (tokens.has('allow-same-origin') && tokens.has('allow-scripts')) { tokens.delete('allow-same-origin'); warn?.(); }
    return [...tokens].join(' ') || DEFAULT_SANDBOX;
}

// Appends ?pk-theme=<theme> to url, only when it resolves to the same origin as base and theme is light or dark; url unchanged otherwise
// (a different origin, an "inherit" theme, or an address that does not parse as a URL).
export function withThemeParam(url, theme, base) {
    if (theme !== 'light' && theme !== 'dark') return url;
    try {
        const u = new URL(url, base);
        if (u.origin !== new URL(base).origin) return url;
        u.searchParams.set('pk-theme', theme);
        return u.href;
    } catch { return url; }
}

export default Base => class extends Base {
    connected() {
        const frame = this.part('frame');
        this.$load = () => { this.emit('pk-frame-load', {}); this.postTheme(); };
        frame.addEventListener('load', this.$load);
        this.$msg = e => {
            if (e.source !== frame.contentWindow || this.height !== 'auto' || !e.data || e.data.type !== 'pk-frame-resize') return;
            const h = Number(e.data.height);
            if (!Number.isFinite(h) || h <= 0) return;
            frame.style.blockSize = `${h}px`;
            this.emit('pk-frame-resize', { height: h });
        };
        window.addEventListener('message', this.$msg);
    }
    disconnected() { window.removeEventListener('message', this.$msg); }

    postTheme() {
        if (this.theme === 'inherit') return;
        this.part('frame').contentWindow?.postMessage({ type: 'pk-theme', theme: this.theme }, '*');
    }

    changed(name) { if (name === 'theme') this.postTheme(); }

    updated() {
        const frame = this.part('frame');
        if (!this.title) this.warnOnce('title', 'title is empty: the framed document has no accessible name for assistive tech');
        frame.setAttribute('sandbox', resolveSandbox(this.sandbox, this.allowSameOrigin,
            () => this.warnOnce('sandbox', `sandbox=${JSON.stringify(this.sandbox)} combines allow-scripts and allow-same-origin: dropping allow-same-origin (set allow-same-origin to opt in for a trusted document)`, { sandbox: this.sandbox })));
        if (this.src) {
            const link = safeLink(this.src);
            if (!link) {
                this.warnOnce('src', `src=${JSON.stringify(this.src)} is not a same-site path or an http(s) address: the frame stays empty`, { src: this.src });
                frame.removeAttribute('src'); frame.removeAttribute('srcdoc');
            } else {
                frame.removeAttribute('srcdoc');
                frame.src = withThemeParam(link, this.theme, location.href);
            }
        } else if (this.html) { frame.removeAttribute('src'); frame.srcdoc = this.html; }
        else { frame.removeAttribute('src'); frame.removeAttribute('srcdoc'); }
        if (this.height && this.height !== 'auto') frame.style.blockSize = this.height;
        else frame.style.removeProperty('block-size');
        const bp = PRESET_BREAKPOINT[this.preset];
        if (bp) frame.style.maxInlineSize = `${breakpoint(bp)}px`;
        else frame.style.removeProperty('max-inline-size');
    }
};
