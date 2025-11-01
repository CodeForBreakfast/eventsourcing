---
"@codeforbreakfast/eventsourcing-server": patch
---

Add integration test verifying EventBus correctly handles late-arriving subscribers. The test confirms that subscribers joining an already-running EventBus only receive events published after their subscription, not historical events from the PubSub.
