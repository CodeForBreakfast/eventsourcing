---
---

Fix Turbo cache invalidation when tool versions change. Turbo will now correctly invalidate all task caches when Bun or other mise-managed tools are upgraded, preventing stale cached results from being used with incompatible tool versions.
