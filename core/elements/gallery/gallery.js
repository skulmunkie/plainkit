// Plainkit gallery element: the SDK's own gallery, framed. The gallery needs its own document (stylesheets, samples in frames), so this
// element only builds the frame's address from its attributes and follows the height the gallery reports. No gallery code loads here.
import { normalizeOptions, toQuery, EMBED_URL } from '../../js/gallery-options.js';
import { READY_MESSAGE, sectionsMessage } from '../../js/gallery-sections.js';

// The frame address for a set of element props. The element shows content only by default (chrome none); theme "auto" leaves the theme to the gallery.
export function frameUrl(props, base = EMBED_URL) {
    const { src, theme, height: _height, sections: _sections, ...rest } = props;
    const query = toQuery({ chrome: 'none', ...normalizeOptions({ ...rest, theme: theme === 'auto' ? '' : theme }) });
    return `${new URL(src || base, globalThis.document?.baseURI ?? globalThis.location?.href).href}?${query}`;
}

// The height a message from the gallery asks for, or 0 when the message is not from this frame's gallery or is not a sane height.
export function reportedHeight(event, frameWindow, origin) {
    if (event.source !== frameWindow || event.origin !== origin || event.data?.type !== 'pk-gallery-height') return 0;
    const h = Number(event.data.height);
    return Number.isFinite(h) && h > 0 && h < 100000 ? Math.ceil(h) : 0;
}

// True when a message is the gallery's "ready" from this frame: the host's sections may be sent now (and again whenever they change).
export function isReady(event, frameWindow, origin) {
    return event.source === frameWindow && event.origin === origin && event.data?.type === READY_MESSAGE;
}

export default Base => class extends Base {
    connected() {
        if (this.$m) return;
        this.$m = e => {
            if (isReady(e, this.part('frame').contentWindow, this.$o)) { this.$ready = true; this.$sent = null; this.send(); return; }
            const h = this.height ? 0 : reportedHeight(e, this.part('frame').contentWindow, this.$o);
            if (h) this.style.setProperty('--pk-gallery-height', `${h}px`);
        };
        addEventListener('message', this.$m);
    }
    // The sections attribute goes to the frame as a message, once the gallery has said it is ready and whenever the text changes; none is sent until there is one.
    send() {
        const value = this.sections || '';
        if (!this.$ready || value === (this.$sent ?? '')) return;
        this.$sent = value;
        try {
            const message = sectionsMessage(value);
            if (message) this.part('frame').contentWindow?.postMessage(message, this.$o); else this.warnOnce('sections', 'sections must be a JSON list: ignored');
        } catch (error) { this.warnOnce('sections', `sections is not valid JSON: ignored (${error.message})`); }
    }
    disconnected() { removeEventListener('message', this.$m); this.$m = null; }
    updated() {
        const frame = this.part('frame'), url = frameUrl(this.$);
        this.$o = new URL(url).origin;
        if (frame.getAttribute('src') !== url) { this.$ready = false; frame.setAttribute('src', url); }
        this.send();
        if (this.height) this.style.setProperty('--pk-gallery-height', `${this.height}px`); else if (this.$hadHeight) this.style.removeProperty('--pk-gallery-height');
        this.$hadHeight = Boolean(this.height);
    }
};
