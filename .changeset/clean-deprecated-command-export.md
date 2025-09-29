---
'@codeforbreakfast/eventsourcing-commands': minor
'@codeforbreakfast/eventsourcing-aggregates': minor
'@codeforbreakfast/eventsourcing-protocol': minor
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
---

Remove deprecated Command type export and clean up legacy code

**BREAKING CHANGE**: The deprecated `Command` type export has been removed from `@codeforbreakfast/eventsourcing-commands`. Use `WireCommand` instead for transport layer commands.

- Removed deprecated `Command` type export - use `WireCommand` for clarity about transport layer vs domain commands
- Updated all internal references from `Command` to `WireCommand`
- Removed migration guides and backward compatibility documentation
- Cleaned up legacy helper functions and test comments

To update your code:

```typescript
// Before
import { Command } from '@codeforbreakfast/eventsourcing-commands';

// After
import { WireCommand } from '@codeforbreakfast/eventsourcing-commands';
```
