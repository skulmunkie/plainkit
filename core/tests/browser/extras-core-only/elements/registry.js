// A core-only folder's registry for the extras case: the real dist registry (tags and extras), but no element module beside it, so every import of ./<name>.js fails.
export { default, extras, extrasVersion } from '../../../../dist/elements/registry.js';
