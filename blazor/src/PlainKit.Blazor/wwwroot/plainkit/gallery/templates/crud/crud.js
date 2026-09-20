import { mountChrome } from '../chrome.js';
mountChrome({ title: "List and detail (CRUD)", page: "crud", crumbs: [["Section","page.html"]], actions: "<button class=\"btn-primary\" data-pk-open=\"#create-modal\">New item</button>", fill: false });
