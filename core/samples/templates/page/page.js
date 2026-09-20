import { mountChrome } from '../chrome.js';
mountChrome({ title: "Page", page: "page", crumbs: [["Section","page.html"],["Group","page.html"]], actions: "<button class=\"btn-primary\">Primary action</button><button class=\"btn-ghost\">Secondary</button>", fill: false });
