---
---

# Fix CI Architecture Validation

Fixed inconsistent architecture validation between CI and local environments. The issue was that dependency-cruiser would analyze different numbers of modules depending on whether build artifacts were present:

- **Without build artifacts**: 94 modules (source only) - correctly detected violations
- **With build artifacts**: 205 modules (source + built files) - incorrectly passed violations

## Changes

- **Updated `.dependency-cruiser.js`**: Added `exclude` configuration to skip `packages/.*/dist/.*` directories
- **Updated `turbo.json`**: Refined `//#arch:check` task inputs to focus on source files only
- **Updated `.github/workflows/ci.yml`**: Changed to use `bun run all` for comprehensive validation

This ensures consistent architecture validation regardless of build state, making CI properly catch architecture violations that were previously missed.
