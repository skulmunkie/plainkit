// Shared guard: does a keydown mean "activate this row" (Enter or Space)? Used by pk-nav-item (a branch row with
// no href) and pk-menu-item (every row), the two elements whose interactive target is not a native <a>/<button>
// and so needs this spelled out by hand. Pure, no DOM.
export const isActivateKey = e => e.key === 'Enter' || e.key === ' ';
