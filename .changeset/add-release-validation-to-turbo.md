---
---

Added release validation to local development workflow. Running `turbo all` now validates changesets and package publishability before pushing to CI, catching configuration errors early and preventing wasted CI cycles.

**Developer Experience:**

- Release validation now runs automatically with `turbo all`
- Immediate feedback on changeset issues (missing packages, invalid references)
- Prevents common CI failures related to changesets and package versions
- No impact on packages - this is a developer tooling improvement only
