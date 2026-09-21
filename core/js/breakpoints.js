// Named breakpoints for scripts: the widths are the ones tokens/breakpoints.json names and the build writes on :root as --pk-bp-phone, --pk-bp-tablet and
// --pk-bp-wide (plainkit.css), so a script and the CSS never disagree, and a custom build changes both at once.
//
//   import { mediaBelow } from '../../js/breakpoints.js';
//   const mq = mediaBelow('phone');        // a MediaQueryList for (max-width: 640px): width at or below the breakpoint, like @media (--phone)
//   mq.matches; mq.addEventListener('change', fn);
//
// Without the custom property (a page that does not load plainkit.css, a test) the default below is used and one debug line says so. Framework-free.
import { createLogger } from './log.js';

// The same values as tokens/breakpoints.json (tests/breakpoints.test.mjs keeps the two equal).
export const DEFAULT_BREAKPOINTS = Object.freeze({ phone: 640, tablet: 1024, wide: 1280 });
const log = createLogger('breakpoints');
const noted = new Set();

/** The width in px of a named breakpoint: the page's --pk-bp-<name> when it has one, else the default. */
export function breakpoint(name) {
    if (!(name in DEFAULT_BREAKPOINTS)) throw new RangeError(`unknown breakpoint "${name}" (known: ${Object.keys(DEFAULT_BREAKPOINTS).join(', ')})`);
    const raw = typeof document !== 'undefined' && typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue(`--pk-bp-${name}`) : '';
    const px = Number.parseFloat(raw);
    if (px > 0) return px;
    if (!noted.has(name)) { noted.add(name); log.debug(`--pk-bp-${name} is not defined on :root (plainkit.css not loaded?); using the default ${DEFAULT_BREAKPOINTS[name]}px`); }
    return DEFAULT_BREAKPOINTS[name];
}

/** The media query text for width at or below the breakpoint, and for width above it. */
export const belowQuery = name => `(max-width: ${breakpoint(name)}px)`;
export const aboveQuery = name => `(min-width: ${breakpoint(name) + 1}px)`;

/** A MediaQueryList for width at or below the breakpoint (@media (--name)), and for width above it (@media (--above-name)). */
export const mediaBelow = name => globalThis.matchMedia(belowQuery(name));
export const mediaAbove = name => globalThis.matchMedia(aboveQuery(name));
