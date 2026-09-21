// Runs a pattern's optional script (samples/patterns/<id>/<id>.js: export default mount(root) -> { destroy() }) on a sample's own markup.
// Two hosts share it: preview.js (the full-page preview) and frame-boot.js (an inline sample frame in the gallery). The script runs in the
// realm that owns the markup, so `document` inside it is the frame's own document and a frame's listeners go away with the frame.
// Framework-free; ES module.
import { createLogger } from '../../js/log.js';

const log = createLogger('gallery-pattern');

// The name a pattern's data gives its script: <id>/<id>.js, nothing else (it lands in an attribute and in a module address).
export const SCRIPT_NAME = /^[\w-]+\/[\w-]+\.js$/;

// The event a host sends to a frame's window to end the sample's script before the frame is removed (pagehide covers the frame going away).
export const DESTROY_EVENT = 'pk-sample-destroy';

const NOTHING = Object.freeze({ destroy() {} });

// Mounts the script at url on root. Always resolves to a handle whose destroy() is safe to call twice; a script that fails to load, has no
// default export, throws in mount or throws in destroy is logged and leaves the static sample as it was.
export async function mountPattern(root, url, name = url, { load = u => import(u) } = {}) {
    let handle;
    try {
        const mount = (await load(url)).default;
        if (typeof mount !== 'function') { log.error(`${name} has no default export to mount`, { url }); return NOTHING; }
        handle = mount(root);
        log.debug(`${name} mounted`, { url });
    } catch (error) { log.error(`the sample script ${name} failed`, error); return NOTHING; }
    let done = false;
    return {
        destroy() {
            if (done) return;
            done = true;
            try { handle?.destroy?.(); } catch (error) { log.error(`the sample script ${name} failed to clean up`, error); }
        },
    };
}

// Inside a sample frame: mounts the script the frame's <html data-pattern="<id>/<id>.js"> names on the body, and ends it on pagehide or when
// the gallery sends DESTROY_EVENT. base is the folder of patterns. Resolves to the handle, or to null when the frame names no script.
export async function bootPattern(win, doc, base, options) {
    const name = doc.documentElement.getAttribute('data-pattern') ?? '';
    if (!SCRIPT_NAME.test(name)) return null;
    const handle = await mountPattern(doc.body, new URL(name, base).href, name, options);
    win.addEventListener('pagehide', () => handle.destroy(), { once: true });
    win.addEventListener(DESTROY_EVENT, () => handle.destroy(), { once: true });
    return handle;
}
