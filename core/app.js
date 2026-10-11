// The whole entry of the site app: the config is data (site/app.config.js), mountApp builds and owns every piece of chrome.
import { mountApp } from './js/app.js';
import config from './site/app.config.js';

mountApp(document.getElementById('app'), config);
