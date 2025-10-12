---
'@codeforbreakfast/eventsourcing-monorepo': patch
---

chore(tooling): upgrade to Bun 1.3.0 and fix build targets

This release upgrades the development tooling to Bun 1.3.0, bringing significant performance improvements and stricter dependency management. The build process now correctly targets Node.js for better compatibility with platform-agnostic Effect code.

**What changed for package consumers:**

- No breaking changes - all published packages remain fully compatible
- Packages are now built with `--target node` instead of `--target bun` for better Node.js compatibility
- Internal README examples have been cleaned up to avoid circular dependencies

**What changed for contributors:**

- Bun upgraded from 1.2.23 to 1.3.0 (~60% faster builds on macOS)
- Isolated installs now enabled by default (stricter dependency management)
- Build targets changed to `node` for all published packages (semantically correct for platform-agnostic Effect code)
- Missing devDependency declarations fixed (exposed by isolated installs)
