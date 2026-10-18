// pk-splitter persist-key, loaded only when a splitter sets one (js/store.js comes with it). Stores { size, collapsed } under `pk-splitter:<key>` like pk-dock's persistKey.
import { createStore } from './store.js';

export function openPersist(key) {
    const store = createStore({ prefix: `pk-splitter:${key}` });
    const mod = store.module('state', { defaults: { size: -1, collapsed: false }, schema: { size: { min: 0, max: 100 } }, persist: ['size', 'collapsed'] });
    return {
        /** The saved state, or null when nothing (valid) was saved. */
        read: () => (mod.get('size') < 0 ? null : { size: mod.get('size'), collapsed: mod.get('collapsed') }),
        save: state => mod.patch(state),
        close: () => { mod.destroy(); store.destroy(); }
    };
}
