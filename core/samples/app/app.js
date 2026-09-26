// The whole entry of the demo app: the config is data, mountApp builds and owns every piece of chrome (bar, menu, search, footer, theme, focus, title).
import { mountApp } from '../../js/app.js';
import config from './app.config.js';

mountApp(document.getElementById('app'), config);
