import { safeHref } from '../../js/safe-url.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';

export default Base => class extends Base {
    connected() { for (const s of ['actions', 'footer', 'media']) this.watchSlot(s, () => this.requestUpdate()); }
    updated() {
        const link = this.part('link');
        const href = safeHref(this.href);
        if (this.href && !href) this.warnOnce('href', `href=${JSON.stringify(this.href)} is not a same-site path, http(s), mailto, tel or sms address: the card has no link`, { href: this.href });
        if (href) link.setAttribute('href', href); else link.removeAttribute('href');
        this.part('header').hidden = !this.heading && this.slotted('actions').length === 0;
        this.part('media').hidden = this.slotted('media').length === 0;
        this.part('footer').hidden = this.slotted('footer').length === 0;
        // A non-ready state draws into part=state (CSS swaps it for the body); loading/error announce through pk-skeleton's and pk-alert's own roles.
        const state = this.state || 'ready', box = this.part('state');
        renderState(box, state, { label: this.stateHeading || (this.heading ? `Loading ${this.heading}` : ''), heading: this.stateHeading, description: this.stateDescription, retry: typeof this.retry === 'function' ? () => this.retry() : undefined });
        if (state !== 'ready') loadElements(box);
    }
};
