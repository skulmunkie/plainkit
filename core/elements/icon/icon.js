// <pk-icon> behaviour. The pure logic (where the sprite is, how one symbol is addressed, drawing it) lives in js/icon-sprite.js, which pk-button icon-name shares.

import { drawIcon } from '../../js/icon-sprite.js';

export { spriteUrl, iconHref, symbolIds } from '../../js/icon-sprite.js';

export default Base => class extends Base {
    updated() {
        drawIcon(this.part('use'), this.name, (key, message, detail) => this.warnOnce(key, message, detail));
        // A label makes the icon an image with that name; without one it is decoration and hidden from assistive tech.
        if (this.label) this.aria({ role: 'img', ariaLabel: this.label, ariaHidden: null });
        else this.aria({ role: null, ariaLabel: null, ariaHidden: 'true' });
    }
};
