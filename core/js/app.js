// The app framework's public entry (#346). Step 3 (#349): defineModule and moduleFromMount (js/app/module.js, the module contract and its page types and
// layouts), and createModuleHost (js/app/host.js, the lifecycle and boundaries). mountApp and mountPage arrive with the next steps.
//
//   import { defineModule, moduleFromMount, createModuleHost } from './plainkit/js/app.js';
export { defineModule, moduleFromMount, registerPageType, registerLayout, MODULE_ID, BUILT_IN_PAGE_TYPES } from './app/module.js';
export { createModuleHost } from './app/host.js';
