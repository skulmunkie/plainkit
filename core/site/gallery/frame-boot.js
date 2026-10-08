// Runs inside every sample frame: wires the SDK behaviours and, when the sample names one, its boot module. An external file so the
// frames run under a strict Content-Security-Policy (no inline script).
import { initPlainkit } from '../../js/plainkit.js';
import { applyDynamic } from '../../js/dynamic.js';
import { bootPattern } from './pattern-mount.js';
import { PATTERNS_DIR } from './paths.js';

initPlainkit();
const root = document.documentElement;
const scale = Number(root.dataset.scale);
if (scale) { root.dataset.dyn = `font-size:${(14 * scale).toFixed(2)}px`; applyDynamic(root); }
const boot = root.dataset.boot;
if (/^[\w-]+$/.test(boot ?? '')) import(`./boots/${boot}.js`);
// A pattern sample runs its own script on the frame's markup (data-pattern), as the full-page preview does.
await bootPattern(window, document, new URL(PATTERNS_DIR, import.meta.url));
