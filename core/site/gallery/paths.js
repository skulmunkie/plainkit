// Where the gallery finds the SDK's own files, relative to this folder. This is the source-tree version; tools/build.mjs writes the
// dist/gallery version, where the same files sit one level up and the class-based components are in plainkit-compat.css.

export const ROOT = new URL('../../', import.meta.url).href;

// Stylesheets a sample frame loads, in order.
export const PAGE_CSS = ['../../plainkit.css'];

export const TOKENS_CSS = '../../tokens/tokens.css';
export const UTILITIES_CSS = '../../components/utilities/utilities.css';
export const SPACING_CSS = '../../components/spacing/spacing.css';
export const ICONS = '../../icons.svg';

// Whether the SDK site pages (theme editor, scorecard, files) exist next to the gallery.
export const HAS_SITE = true;

// Where the full-page templates live, relative to this folder.
export const TEMPLATES_DIR = '../../samples/templates/';

// The page that hosts a pattern or layout fragment as a whole page (also what "Open in new page" opens).
export const PREVIEW = 'preview.html';
