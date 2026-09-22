// Named breakpoints, resolved at build time. Dependency-free.
//
// The one source is tokens/breakpoints.json: names and widths in px, ascending (phone 640, tablet 1024, wide 1280). CSS custom properties cannot be
// used inside @media, so element CSS names a breakpoint and the build writes the real query into the generated module (zero runtime cost):
//
//   @media (--phone)            ->  @media (max-width: 640px)       width <= the breakpoint (the codebase is desktop-first)
//   @media (--above-phone)      ->  @media (min-width: 641px)       the complement: width > the breakpoint
//
// Only a parenthesised name inside an @media condition is replaced, so it combines like any feature:
//   @media (--phone) and (orientation: portrait)      @media (pointer: coarse), (--phone)      @media (--above-phone) and (--tablet)   (a band)
// An unknown name is a build error that lists the known names. Comments are left alone. Nothing else in the CSS is touched.
//
// CSS that a page loads straight from the source tree (tokens, base, site, module and sample CSS) is not built, so it cannot use a name: it writes the
// literal query with the same width, and tests/breakpoints.test.mjs fails when a literal is not one of these widths.
//
// The build also writes the widths as custom properties (--pk-bp-phone: 640px, ...) for js/breakpoints.js and for documentation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBreakpoints, conditionMap, resolveCustomMedia, breakpointProperties } from '../js/custom-sdk-logic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BREAKPOINTS_FILE = path.join(here, '..', 'tokens', 'breakpoints.json');

// The transform itself is js/custom-sdk-logic.js (pure, so the theme editor's export applies the same code in the browser); this file adds only the file read.
export { parseBreakpoints, conditionMap, resolveCustomMedia, breakpointProperties };

export const loadBreakpoints = (file = BREAKPOINTS_FILE) => parseBreakpoints(JSON.parse(fs.readFileSync(file, 'utf8')));
