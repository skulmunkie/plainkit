// The three theme calls the app entry needs (#514): read, set and toggle data-theme. Split out of theme.js so the entry does not carry the override, token and colour code.
// theme.js re-exports them, so the public API is unchanged. Framework-free, no imports.

export function setTheme(element, name) {
    element.setAttribute('data-theme', name === 'light' ? 'light' : 'dark');
    return element.getAttribute('data-theme');
}

export const currentTheme = element => (element.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

export function toggleTheme(element) {
    return setTheme(element, currentTheme(element) === 'dark' ? 'light' : 'dark');
}
