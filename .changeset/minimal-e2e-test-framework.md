---
'@codeforbreakfast/eventsourcing-testing-contracts': minor
---

Add minimal failing e2e test framework for complete system integration

This adds a comprehensive end-to-end test that demonstrates the complete event sourcing flow from frontend command sending through to event persistence and subscription. The test includes:

- High-level EventSourcingClient service for clean frontend integration
- Server-side protocol handling stubs for bridging transport to command processing
- Event publishing stubs for streaming events back to clients
- Complete stack rebuild pattern to verify true event persistence
- Proper Effect functional programming patterns with tagged errors and Layer composition

The test is currently skipped as it contains only minimal stubs that fail with "not implemented" errors. This serves as a specification for the remaining integration work needed to complete the event sourcing system.

Key components added:

- EventSourcingClient service with subscribeToStream/sendCommand methods
- ServerProtocolHandler service for processing commands
- EventPublisher service for streaming events to subscribers
- Full system test demonstrating command → processing → events → persistence flow
