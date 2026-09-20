import { skipTarget } from '../../js/scroll-aids.js';

// pk-skip-link: jumps to a same-page fragment and really moves focus there (the target is made focusable).
export default Base => class extends Base {
    updated() { const t = skipTarget(this.href); const a = this.part('link'); if (t) a.setAttribute('href', `#${t}`); else a.removeAttribute('href'); }
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.part('link').addEventListener('click', e => {
            const id = skipTarget(this.href); const t = id && document.getElementById(id);
            if (!t) return;
            e.preventDefault();
            if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
            t.focus(); t.scrollIntoView();
        });
    }
};
