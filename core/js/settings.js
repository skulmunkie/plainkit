// Per-viewer plain-string settings in localStorage (moved here from the gallery site, #348; the site re-exports them until it adopts the store, js/store.js).
// A blocked or full storage means the setting does not persist: it is logged once through the SDK logger and never thrown.
//
//   import { readSetting, writeSetting } from './settings.js';
//   const scale = readSetting('pk-gallery-scale');   // string or null
//   writeSetting('pk-gallery-scale', '1.25');
//
// For structured, versioned, validated, subscribable state use createStore (js/store.js), which also re-exports these two. Never store secrets here.
import { createLogger } from './log.js';

const log = createLogger('settings');
let told = false;
export const tell = e => told || (told = !!log.warn('storage is blocked or full; the setting is not kept', e));
export const readSetting = key => { try { return localStorage.getItem(key); } catch (e) { tell(e); return null; } };
export const writeSetting = (key, value) => { try { localStorage.setItem(key, value); } catch (e) { tell(e); } };
