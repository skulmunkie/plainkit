// Migration aid for apps moving off the retired class-based component vocabulary (issue #214; the vocabulary itself was removed in
// "Remove the class-based components", 6cf3a04). That old layer (core/components/, the plainkit-compat stylesheet) is gone: an
// element that still carries one of its class names renders unstyled with no warning, error or failed test to say so.
//
// This module is opt-in: it is not imported by init.js or plainkit.js, so a page that does not call it pays nothing (no bundle
// weight, no MutationObserver, no scan). During a migration, a page imports it once:
//
//   import { checkCompatClasses } from './plainkit/js/compat-warn.js';
//   checkCompatClasses(); // one-off scan of the whole document, and observes later DOM additions
//
// Each retired class is reported at most once per page (scope: 'compat'), at warn level (this flags real breakage: lost
// styling, not routine debug noise -- see core/STANDARDS.md, "Logging"), naming the pk-* element and prop that replaces it.
// See core/site/guides/content/migrating-from-compat.md for the full map with examples.
import { createLogger } from './log.js';

const log = createLogger('compat');

// class name -> replacement hint. Root/family classes and their distinctive modifiers from every core/components/* folder
// removed in 6cf3a04, excluding the page-level layer that survived the move to core/base/ (utilities, spacing, typography,
// table-content: those classes still work). Generic single-word classes that real apps commonly reuse for unrelated purposes
// (active, open, error, card, done, ...) are left out on purpose to avoid false positives; the guide covers them in context.
export const RETIRED_CLASSES = {
    // button
    'btn-primary': 'pk-button variant="primary"',
    'btn-secondary': 'pk-button variant="secondary"',
    'btn-ghost': 'pk-button variant="ghost"',
    'btn-warn': 'pk-button variant="warn"',
    'btn-mini': 'pk-button size="mini"',
    'btn-group': 'pk-button-group',

    // chip -> badge or tag, depending on whether it is dismissible/interactive
    chip: 'pk-badge or pk-tag',
    'chip-btn': 'pk-tag removable',
    'chip-muted': 'pk-badge variant="muted"',
    'chip-info': 'pk-badge variant="accent"',
    'chip-success': 'pk-badge variant="ok"',
    'chip-warn': 'pk-badge variant="warn"',
    'chip-danger': 'pk-badge variant="danger"',
    'chip-accent': 'pk-badge variant="accent"',

    // card
    'card-header': 'pk-card heading',

    // cluster (now a first-class element, not a class)
    cluster: 'pk-cluster',
    'cluster--horizontal': 'pk-cluster (default orientation)',
    'cluster--vertical': 'pk-cluster orientation="vertical"',

    // empty-state
    'empty-state': 'pk-empty-state',
    'empty-state-icon-wrap': 'pk-empty-state slot="icon"',
    'empty-state-title': 'pk-empty-state heading',
    'empty-state-description': 'pk-empty-state description',
    'empty-state-actions': 'pk-empty-state slot="actions"',

    // extras
    'form-grid': 'pk-form or pk-grid',
    'field-help': 'pk-hint',
    'field-error': 'pk-hint tone="error"',
    'input-group': 'pk-input with slot="prefix"/"suffix"',
    switch: 'pk-switch',
    pagination: 'pk-pagination',
    'page-link': 'pk-pagination',
    pills: 'pk-tabs',
    pill: 'pk-tag or pk-badge',
    stepper: 'pk-stepper',
    'list-group': 'pk-list-group',
    accordion: 'pk-accordion',
    progress: 'pk-progress',
    spinner: 'pk-spinner',
    skeleton: 'pk-skeleton',
    toast: 'pk-toast',
    avatar: 'pk-avatar',
    timeline: 'pk-timeline',
    divider: 'pk-divider',
    tip: 'pk-tooltip',

    // file-upload
    'job-panel': 'pk-dropzone',
    'upload-accepted': 'pk-dropzone',

    // flyout -> drawer
    'flyout-backdrop': 'pk-drawer',
    'flyout-panel': 'pk-drawer',
    'flyout-panel--wide': 'pk-drawer wide',
    'flyout-panel--docked': 'pk-drawer docked',
    'flyout-resize-handle': 'pk-splitter',
    'flyout-header': 'pk-drawer heading',
    'flyout-body': 'pk-drawer (default slot)',
    'flyout-footer': 'pk-drawer slot="footer"',
    'flyout-actions': 'pk-form-actions',
    'flyout-close': 'pk-drawer (built-in close control)',

    // form-field
    'form-row': 'pk-field-row',
    ff: 'pk-field',
    'ff--wide': 'pk-field',
    'ff--compact': 'pk-field',
    'ff--inline': 'pk-field-row align="center"',
    'ff-required': 'pk-field required',
    'ff-hint': 'pk-hint',
    chk: 'pk-checkbox',
    'chk--compact': 'pk-checkbox',

    // grid-chrome / table-content -> table, table-filters, pagination, grid
    dg: 'pk-table or pk-grid',
    'dg-toolbar': 'pk-toolbar',
    'dg-filters': 'pk-table-filters',
    'dg-filter': 'pk-table-filters',
    'dg-search': 'pk-input',
    'dg-pager': 'pk-pager',
    'dg-cards': 'pk-table cards',
    'dg-body': 'pk-table',
    'dg-filterrow': 'pk-table-filters',
    'dg-sortable': 'pk-table sort',
    'dg-select-cell': 'pk-table selectable',

    // icon
    'icon--xl': 'pk-icon size="xl"',

    // image-gallery
    'gal-gallery': 'pk-image-gallery or pk-gallery',
    'gal-item': 'pk-image-gallery',
    'gal-item--primary': 'pk-image-gallery',
    'gal-badge': 'pk-badge',
    'gal-actions': 'pk-image-gallery slot="actions"',
    'gal-add': 'pk-dropzone',

    // loading
    loading: 'pk-loading-overlay or pk-spinner',

    // maint-section
    'maint-section': 'pk-detail-layout or pk-page-header variant="section"',
    'maint-section-header': 'pk-page-header variant="section"',

    // modal
    'modal-overlay': 'pk-dialog',
    'modal-card': 'pk-dialog',
    'modal-body': 'pk-dialog (default slot)',
    'modal-footer': 'pk-dialog slot="footer"',

    // nav (snav = side nav, tnav = top nav)
    snav: 'pk-side-nav',
    'snav-brand': 'pk-side-nav slot="brand"',
    'snav-group': 'pk-side-nav (nav-group items)',
    'snav-group-title': 'pk-nav-item heading',
    'snav-link': 'pk-nav-item',
    'snav-badge': 'pk-badge',
    'snav-toggle': 'pk-side-nav collapsed',
    'snav--collapsed': 'pk-side-nav collapsed',
    tnav: 'pk-navbar',
    'tnav-brand': 'pk-navbar slot="brand"',
    'tnav-links': 'pk-navbar (pk-nav-item items)',
    'tnav-link': 'pk-nav-item',
    'tnav--open': 'pk-navbar open',
    'mobile-nav-toggle': 'pk-navbar (built-in toggle)',
    dropdown: 'pk-dropdown',
    'dropdown-menu': 'pk-dropdown',
    'dropdown-item': 'pk-menu-item',

    // notice / remedy -> alert
    notice: 'pk-alert',
    'notice--error': 'pk-alert kind="danger"',
    'notice--warning': 'pk-alert kind="warning"',
    'notice--info': 'pk-alert kind="info"',
    'notice--success': 'pk-alert kind="success"',
    'notice-title': 'pk-alert heading',
    'notice-dismiss': 'pk-alert dismissible',
    remedy: 'pk-alert banner',
    'remedy-body': 'pk-alert (default slot)',
    'remedy-actions': 'pk-alert slot="actions"',
    'remedy--error': 'pk-alert kind="danger" banner',
    'remedy--info': 'pk-alert kind="info" banner',

    // page-header / record-header
    'page-header': 'pk-page-header variant="page"',
    'page-header-titlebar': 'pk-page-header',
    'page-header-actions': 'pk-page-header slot="actions"',
    'page-crumbs': 'pk-breadcrumb',
    'record-header': 'pk-page-header variant="record"',
    'record-header-title': 'pk-page-header heading',
    'record-header-actions': 'pk-page-header slot="actions"',

    // shell
    'shell-body': 'pk-app-shell',
    'shell-main': 'pk-app-shell',
    'shell-footer': 'pk-app-shell slot="footer"',
    'shell-backdrop': 'pk-app-shell (built-in backdrop)',
    'sticky-header': 'pk-app-shell sticky',
    'form-savebar': 'pk-form-actions',

    // tabs
    tabs: 'pk-tabs',
    tab: 'pk-tab',
    'tab-close': 'pk-tab (built-in close control)',
    'tabs--scroll': 'pk-tabs scroll',

    // toolbar
    'toolbar-lead': 'pk-toolbar heading',
    'toolbar-note': 'pk-toolbar note',
    'toolbar-actions': 'pk-toolbar slot="actions"',

    // topbar
    'topbar-back': 'pk-navbar (built-in back control) or pk-breadcrumb',
    'topbar-title': 'pk-navbar heading',
    'top-row': 'pk-navbar',
    'app-header-title': 'pk-navbar heading',
    'app-header-search': 'pk-app-bar-search',
    'app-search': 'pk-app-bar-search',
    'app-search-input': 'pk-app-bar-search',
    'app-search-toggle': 'pk-app-bar-search',

    // workspace
    workspace: 'pk-workspace',
    'workspace-nav': 'pk-workspace slot="nav"',
    'workspace-main': 'pk-workspace (default slot)',
    'workspace-bar': 'pk-toolbar',
    'workspace--fill': 'pk-workspace',
};

const reported = new Set();
const observed = new WeakSet();

function classesOf(el) {
    const out = [];
    for (const c of el.classList) if (Object.prototype.hasOwnProperty.call(RETIRED_CLASSES, c)) out.push(c);
    return out;
}

function reportIn(root) {
    const els = [...(root.classList ? [root] : []), ...(root.querySelectorAll ? root.querySelectorAll('[class]') : [])];
    for (const el of els) {
        for (const cls of classesOf(el)) {
            if (reported.has(cls)) continue;
            reported.add(cls);
            log.warn(`.${cls} is a retired Plainkit class (removed with the class-based components): use ${RETIRED_CLASSES[cls]} instead`, { class: cls, replacement: RETIRED_CLASSES[cls] });
        }
    }
}

// Scans `root` once for elements carrying a retired class, then observes it for later additions. Call explicitly during a
// migration; not run automatically. Returns the MutationObserver (or null where MutationObserver is unavailable), so the
// caller can .disconnect() it once the migration is done.
export function checkCompatClasses(root = document) {
    reportIn(root);
    if (typeof MutationObserver === 'undefined' || observed.has(root)) return null;
    observed.add(root);
    const mo = new MutationObserver(records => {
        for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) reportIn(n);
    });
    mo.observe(root.documentElement ?? root, { childList: true, subtree: true });
    return mo;
}
