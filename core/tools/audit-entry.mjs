// audit.mjs at the root of the plainkit.audit module: `node audit.mjs <path> [options]` runs the conformance audit (see tools/audit/cli.mjs).
import { run } from './tools/audit/cli.mjs';
process.exit(await run(process.argv.slice(2)));
