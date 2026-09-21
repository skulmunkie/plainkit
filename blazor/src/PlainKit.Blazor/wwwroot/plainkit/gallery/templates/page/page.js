import { mountChrome } from '../chrome.js';
mountChrome({ title: "Page", page: "page", crumbs: [["Section","page.html"],["Group","page.html"]], actions: "<pk-button>Primary action</pk-button><pk-button variant=\"ghost\">Secondary</pk-button>", fill: false });
