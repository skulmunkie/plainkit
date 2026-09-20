// Plainkit gallery element: the SDK's own gallery, framed. The gallery needs its own document (stylesheets, samples in frames), so this
// element only builds the frame's address from its attributes and follows the height the gallery reports. No gallery code loads here.
import { normalizeOptions, toQuery, EMBED_URL } from '../../js/gallery-options.js';

// The frame address for a set of element props. The element shows content only by default (chrome none); theme "auto" leaves the theme to the gallery.
export function frameUrl(props, base = EMBED_URL) {
    const { src, theme, height: _height, ...rest } = props;
    const query = toQuery({ chrome: 'none', ...normalizeOptions({ ...rest, theme: theme === 'auto' ? '' : theme }) });
    return `${new URL(src || base, globalThis.location?.href).href}?${query}`;
}

// The height a message from the gallery asks for, or 0 when the message is not from this frame's gallery or is not a sane height.
export function reportedHeight(event, frameWindow, origin) {
    if (event.source !== frameWindow || event.origin !== origin || event.data?.type !== 'pk-gallery-height') return 0;
    const h = Number(event.data.height);
    return Number.isFinite(h) && h > 0 && h < 100000 ? Math.ceil(h) : 0;
}

export default Base => class extends Base {
    connected() {
        if (this.$m) return;
        this.$m = e => {
            const h = this.height ? 0 : reportedHeight(e, this.part('frame').contentWindow, this.$o);
            if (h) this.style.setProperty('--pk-gallery-height', `${h}px`);
        };
        addEventListener('message', this.$m);
    }
    disconnected() { removeEventListener('message', this.$m); this.$m = null; }
    updated() {
        const frame = this.part('frame'), url = frameUrl(this.$);
        this.$o = new URL(url).origin;
        if (frame.getAttribute('src') !== url) frame.setAttribute('src', url);
        if (this.height) this.style.setProperty('--pk-gallery-height', `${this.height}px`); else if (this.$hadHeight) this.style.removeProperty('--pk-gallery-height');
        this.$hadHeight = Boolean(this.height);
    }
};
