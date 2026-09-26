// Per-viewer settings kept in localStorage; a blocked or full store just means a setting does not persist. The helpers live in core (js/settings.js);
// this file re-exports them until the site adopts the store (app-framework step 15, #346).

export { readSetting, writeSetting } from '../../js/settings.js';
