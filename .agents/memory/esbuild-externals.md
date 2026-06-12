---
name: esbuild externals for api-server
description: Which packages must be externalized and why
---
## Rule
Any package that uses dynamic file path resolution at runtime (loads assets relative to its own install path) must be added to the `external` array in `artifacts/api-server/build.mjs`.

## Current extras added beyond the template defaults
- `pdfkit` — loads AFM font files relative to its package directory at runtime

**How to apply:** When adding a new npm package to api-server and the build or runtime throws `Cannot find module` or `ENOENT` for a file inside the package, externalize it.
