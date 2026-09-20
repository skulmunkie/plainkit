import { setTheme } from '../../../js/theme.js';
setTheme(document.documentElement, new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark');
