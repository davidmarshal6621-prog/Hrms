---
name: OpenAPI Zod export collisions
description: Non-obvious export behavior when Orval generates inline request schemas and TypeScript types for the same operation
---

When adding inline request or response schemas to the OpenAPI document, Orval can generate the same name as both a Zod schema value and a TypeScript type. Re-exporting both generated barrels with `export *` then fails the library typecheck.

**Why:** The generated Zod API module and generated TypeScript types module use operation-derived names independently, so collisions are not visible until the workspace build checks both exports.

**How to apply:** After adding inline OpenAPI operations, run the API codegen and library typecheck together. If names collide, keep the Zod API exports direct and explicitly re-export generated types, aliasing only the colliding type names.