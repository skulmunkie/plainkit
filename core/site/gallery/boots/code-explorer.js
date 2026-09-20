// Sample boot: gives the <code-explorer> element an in-memory snapshot. Loaded by frame-boot.js when a sample says @boot code-explorer.
import '../../../js/code-explorer/element.js';
import { SnapshotProvider } from '../../../js/code-explorer/providers.js';
import { SAMPLE_SNAPSHOT } from '../sample-tree.js';

document.querySelector('code-explorer').provider = new SnapshotProvider(SAMPLE_SNAPSHOT);
