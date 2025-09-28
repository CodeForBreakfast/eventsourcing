---
'@codeforbreakfast/eventsourcing-monorepo': patch
---

Add npm as dev dependency to support OIDC trusted publishing

Installs npm 11.6.1+ as a dev dependency to enable OIDC trusted publishing in GitHub Actions. This eliminates the need for long-lived NPM_TOKEN secrets when publishing packages to the npm registry.
