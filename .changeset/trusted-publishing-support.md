---
'@codeforbreakfast/eventsourcing-monorepo': patch
---

Add OIDC support for npm trusted publishing in CI/CD workflow

Enables secure package publishing via OpenID Connect (OIDC) authentication, eliminating the need for long-lived NPM tokens. Once configured on npmjs.com, packages will be published using short-lived, cryptographically-secured credentials with automatic provenance attestations.
