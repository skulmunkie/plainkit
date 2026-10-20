#!/usr/bin/env node
// The `plainkit` bin of the npm package. The audit CLI is its own module, plainkit.audit (packages.json, #1656): this stub only says where to get it,
// so `npx plainkit audit` explains itself instead of failing. It imports nothing.
console.log(`plainkit audit is the module "plainkit.audit", a separate download (no npm package).
Get it, then run it with Node 18 or newer:
  - unzip plainkit.audit-<version>.zip from the GitHub release (or the full plainkit-dist zip, which contains it), then: node audit.mjs <path>
  - or take the files from the folder packages/plainkit.audit/ of the Plainkit Pages site, then: node audit.mjs <path>`);
process.exit(process.argv.length > 2 ? 2 : 0);
