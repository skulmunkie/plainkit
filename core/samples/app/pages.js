// Entry of the page-type tour: the config is data, mountApp builds the chrome.
import { mountApp } from '../../js/app.js';
import config from './pages.config.js';

mountApp(document.getElementById('app'), config);
