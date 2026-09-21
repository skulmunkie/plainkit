import { mountChrome } from '../chrome.js';
mountChrome({ title: "List and detail (CRUD)", page: "crud", crumbs: [["Section","page.html"]], actions: "<pk-button data-open=\"#create-modal\">New item</pk-button>", fill: false });
