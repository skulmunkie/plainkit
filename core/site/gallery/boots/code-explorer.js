// Sample boot: gives the <pk-code-explorer> element an in-memory snapshot. Loaded by frame-boot.js when a sample says @boot code-explorer.
// The modules belong to the tools package: imported here, so a gallery without tools shows a notice in the sample.
import { createLogger } from '../../../js/log.js';
import { SAMPLE_SNAPSHOT } from '../sample-tree.js';

const doc = document, log = createLogger('gallery-boot');
try {
    await import('../../../modules/code-explorer/element.js');
    const { SnapshotProvider } = await import('../../../modules/code-explorer/providers.js');
    doc.querySelector('pk-code-explorer').provider = new SnapshotProvider(SAMPLE_SNAPSHOT);
} catch (err) {
    log.warn('The code explorer could not load; add the tools option to enable it.', err);
    doc.querySelector('pk-code-explorer')?.replaceChildren('Add the tools option to enable the code explorer.');
}
