// Sample frames: every live sample renders inside an iframe so the SDK's media queries answer to the FRAME's width, which is
// what makes the desktop / phone switch real (a 375px frame really is a phone). srcdoc frames are same-origin, so the gallery
// can reach into them to set the theme and text size.
// Framework-free; ES module.

import { PAGE_CSS } from './paths.js';

export const GALLERY_BASE = new URL('./', import.meta.url).href;
export const PHONE_WIDTH = 375;

// The document a sample renders in: plainkit.css, the sample's markup, and every behaviour module initialised.
export function sampleDoc(html, { theme = 'dark', scale = 1, script = '' } = {}) {
    return `<!doctype html><html lang="en" data-theme="${theme}" data-scale="${scale}"${script ? ` data-boot="${script}"` : ''}><head><meta charset="utf-8">`
        + `<meta name="viewport" content="width=device-width, initial-scale=1"><base href="${GALLERY_BASE}">`
        + `${PAGE_CSS.map(h => `<link rel="stylesheet" href="${h}">`).join('')}<link rel="stylesheet" href="frame.css"></head><body>${html}`
        + `<script type="module" src="frame-boot.js"></script></body></html>`;
}

export function applyToFrame(frame, { theme, scale, width }) {
    const doc = frame.contentDocument;
    if (doc?.documentElement) {
        if (theme) doc.documentElement.setAttribute('data-theme', theme);
        if (scale) doc.documentElement.style.fontSize = `${(14 * scale).toFixed(2)}px`;
    }
    if (width !== undefined) frame.style.width = width === 'phone' ? `${PHONE_WIDTH}px` : '100%';
    fit(frame);
}

// Make the frame as tall as its content (or its fixed height when the sample asks for one).
export function fit(frame) {
    const fixed = Number(frame.dataset.height);
    if (fixed) { frame.style.height = `${fixed}px`; return; }
    const doc = frame.contentDocument;
    if (!doc?.documentElement) return;
    frame.style.height = '0px';
    // The frame has a border: with border-box sizing the content height alone leaves the frame two pixels short, and a scrollbar appears.
    const edge = getComputedStyle(frame).boxSizing === 'border-box' ? frame.offsetHeight - frame.clientHeight : 0;
    frame.style.height = `${Math.max(doc.documentElement.scrollHeight, 40) + edge}px`;
}

export function makeFrame(sample, state, control = '') {
    const frame = document.createElement('iframe');
    frame.className = 'gx-frame';
    frame.title = sample.title ?? control;
    if (control) frame.dataset.control = control;
    if (sample.height) frame.dataset.height = String(sample.height);
    frame.srcdoc = sampleDoc(sample.html, { theme: state.theme, scale: state.scale, script: sample.script });
    frame.addEventListener('load', () => {
        applyToFrame(frame, state);
        const doc = frame.contentDocument;
        if (doc?.body && 'ResizeObserver' in window) new ResizeObserver(() => fit(frame)).observe(doc.body);
    });
    frame.style.width = state.width === 'phone' ? `${PHONE_WIDTH}px` : '100%';
    return frame;
}
