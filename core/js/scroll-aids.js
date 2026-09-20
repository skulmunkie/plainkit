// Plainkit scroll aids: the arithmetic behind <pk-scroll-progress>, <pk-back-to-top> and the skip link. Pure, so it can be tested
// without a DOM. Each element listens to one scroller (the window, or the element named by `for`, e.g. the shell body).

export const TOP_THRESHOLD = 400;

// Scrolled fraction 0..1 of what can scroll; 0 when nothing scrolls.
export function scrollProgress(scrollTop, scrollHeight, clientHeight) {
    const room = scrollHeight - clientHeight;
    return room <= 0 ? 0 : Math.min(1, Math.max(0, scrollTop / room));
}

// Show the back-to-top button once the reader is past `threshold` px (default: a screen or so) and there is somewhere to go back to.
export const showBackToTop = (scrollTop, threshold = TOP_THRESHOLD) => scrollTop > threshold;

// Smooth unless the reader asked for less motion.
export const scrollBehavior = reducedMotion => (reducedMotion ? 'auto' : 'smooth');

// Overflowing strips (tabs, chips): which edges have content hidden beyond them, so the strip can show a fade and a scroll button there.
// scrollLeft is negative in right-to-left layouts in current browsers; its magnitude is what matters.
export function edgeState(scrollLeft, scrollWidth, clientWidth, eps = 1) {
    const at = Math.abs(scrollLeft);
    return { start: at > eps, end: at + clientWidth < scrollWidth - eps };
}

// How far a scroll button moves a strip: most of a screen of it, so the last visible item stays in view as context.
export const scrollStepPx = (clientWidth, fraction = 0.8) => Math.max(1, Math.round(clientWidth * fraction));

// The scrollLeft that brings a child fully into view with `margin` px around it; unchanged when it is already visible.
export function revealLeft(itemLeft, itemWidth, viewWidth, current, margin = 8) {
    if (itemLeft - margin < current) return Math.max(0, itemLeft - margin);
    const right = itemLeft + itemWidth + margin;
    return right > current + viewWidth ? right - viewWidth : current;
}

// A skip link may only point at a same-page fragment; anything else is ignored so it cannot become a redirect.
export const skipTarget = href => (typeof href === 'string' && /^#[\w-]+$/.test(href) ? href.slice(1) : null);
