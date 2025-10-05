---
---

Fix Node.js MODULE_TYPELESS_PACKAGE_JSON warnings during build

The root package.json now includes `"type": "module"` to eliminate Node.js warnings about module type detection. This improves build performance by preventing Node from reparsing ES module files as CommonJS.

Additionally, the `.dependency-cruiser.js` configuration file has been converted from CommonJS to ES module format to maintain compatibility with the new module type setting.

Note: A Turborepo warning about missing lockfile entries for transitive dependencies remains present. This is a known Turborepo bug (vercel/turborepo#10658) with Bun lockfile parsing and does not affect functionality.
