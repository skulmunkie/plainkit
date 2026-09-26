// The top-layout demo: the same mountApp, one config key different (layout: 'top'), for an app with two modules and no module nav.
import { mountApp } from '../../js/app.js';
import config from './top.config.js';

mountApp(document.getElementById('app'), config);
