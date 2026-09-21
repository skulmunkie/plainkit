// Runs inside every sample frame: wires the SDK behaviours and, when the sample names one, its boot module. An external file so the
// frames run under a strict Content-Security-Policy (no inline script).
import { initPlainkit } from '../js/plainkit.js';

initPlainkit();
const scale = Number(document.documentElement.dataset.scale);
if (scale) document.documentElement.style.fontSize = `${(14 * scale).toFixed(2)}px`;
const boot = document.documentElement.dataset.boot;
if (/^[\w-]+$/.test(boot ?? '')) import(`./boots/${boot}.js`);
