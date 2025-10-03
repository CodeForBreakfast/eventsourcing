---
---

ESLint now detects and prevents pointless identity functions in Effect transformations (e.g., `Effect.map((x) => x)`). These no-op transformations add unnecessary noise to code pipelines and are now flagged as errors, helping maintain cleaner and more intentional Effect compositions.
