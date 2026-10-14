// Plainkit gallery element: the SDK's own gallery, framed. The gallery needs its own document (stylesheets, samples in frames), so this
// element only builds the frame's address from its attributes and follows the height the gallery reports. No gallery code loads here.
import { normalizeOptions, toQuery, EMBED_URL } from '../../js/gallery-options.js';
import { READY_MESSAGE, sectionsMessage } from '../../js/gallery-sections.js';
import { safeLink } from '../../js/safe-url.js';

const MISSING_MS = 6000;
const PAGES_EMBED = 'https://skulmunkie.github.io/plainkit/dist/gallery/embed.html';

// The frame address for a set of element props. A src that is not a same-site path or http(s) (a javascript: or data: address would run in the host page) is ignored. The element shows content only by default (chrome none); theme "auto" leaves the theme to the gallery.
export function frameUrl(props, base = EMBED_URL) {
    const { src, theme, height: _height, sections: _sections, ...rest } = props;
    const query = toQuery({ chrome: 'none', ...normalizeOptions({ ...rest, theme: theme === 'auto' ? '' : theme }) });
    return `${new URL(safeLink(src) ? src : base, globalThis.document?.baseURI ?? globalThis.location?.href).href}?${query}`;
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
            if (isReady(e, this.part('frame').contentWindow, this.$o)) { this.$ready = true; clearTimeout(this.$t); this.part('notice').hidden = true; this.$sent = null; this.send(); return; }
            const h = this.height ? 0 : reportedHeight(e, this.part('frame').contentWindow, this.$o);
            if (h) this.style.setProperty('--pk-gallery-height', `${h}px`);
        };
        addEventListener('message', this.$m);
        // The gallery files are not part of the npm package (they ship on the Pages site and in the release zip): a frame that loads but never says it is ready means they are missing.
        this.$l = () => { clearTimeout(this.$t); this.$t = setTimeout(() => this.missing(), MISSING_MS); };
        this.part('frame').addEventListener('load', this.$l);
    }
    missing() {
        if (this.$ready) return;
        this.part('notice').hidden = false;
        this.warnOnce('missing', `no gallery answered at ${this.part('frame').getAttribute('src')}: set src to a hosted embed.html (${PAGES_EMBED}) or copy dist/gallery from the release zip`);
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
    disconnected() { removeEventListener('message', this.$m); this.$m = null; clearTimeout(this.$t); this.part('frame').removeEventListener('load', this.$l); }
    updated() {
        const frame = this.part('frame'), url = frameUrl(this.$);
        this.$o = new URL(url).origin;
        if (frame.getAttribute('src') !== url) { this.$ready = false; this.part('notice').hidden = true; frame.setAttribute('src', url); }
        this.send();
        if (this.height) this.style.setProperty('--pk-gallery-height', `${this.height}px`); else if (this.$hadHeight) this.style.removeProperty('--pk-gallery-height');
        this.$hadHeight = Boolean(this.height);
    }
};
