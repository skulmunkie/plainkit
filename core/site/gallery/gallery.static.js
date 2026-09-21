// The gallery's hand-maintained static data: breakpoints, text pairs, responsive rules. The elements, samples and layouts are generated
// by tools/build.mjs into gallery.data.js.

export const BREAKPOINTS = [
    { name: 'phone', px: 640, meaning: 'Single column, thumb-reachable. PkTable becomes cards, Toolbar and PkDialog go full width, PkDrawer is full screen, the top bar shows the title and collapses the search to a button.' },
    { name: 'tablet', px: 1024, meaning: 'Two columns; the sidebar goes off-canvas behind the hamburger.' },
    { name: 'wide', px: 1280, meaning: 'Wide multi-column layouts relax.' },
];

export const TEXT_PAIRS = [
    ['--color-text', '--color-bg'], ['--color-text', '--color-panel'], ['--color-muted', '--color-bg'],
    ['--color-muted', '--color-panel'], ['--color-link', '--color-panel'], ['--color-accent', '--color-panel'],
];

export const RESPONSIVE_RULES = [
    { width: '1280px and below', change: 'Wide multi-column layouts relax to fewer columns.' },
    { width: '1024px and below', change: 'Sidebar off-canvas; the hamburger appears in the top bar.' },
    { width: '640px and below', change: 'One column. PkTable rows become cards, Toolbar rows take the full width, PkDialog and PkDrawer go full screen, the top bar shows the title and the search becomes a button, and a workspace shows one panel at a time.' },
];
