---
'@codeforbreakfast/eventsourcing-server': patch
---

EventBus now handles exceptions thrown by subscriber filter functions gracefully

When a subscriber's filter function throws an exception, that subscriber will silently skip the event instead of crashing the entire EventBus. Other subscribers continue to receive events normally. This improves resilience and prevents one misbehaving subscriber from affecting the entire event distribution system.
