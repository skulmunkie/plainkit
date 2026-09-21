import { loadElements, observeElements } from '../../../js/loader.js';
import { setTheme } from '../../../js/theme.js';
setTheme(document.documentElement, new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark');
loadElements(document).catch(() => {});
observeElements(document);
