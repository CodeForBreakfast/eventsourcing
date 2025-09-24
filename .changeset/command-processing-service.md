---
'@codeforbreakfast/eventsourcing-aggregates': minor
---

Add Command Processing Service to bridge ServerProtocol and EventStore operations

This release introduces the Command Processing Service, which provides the missing orchestration layer between server protocol commands and event store operations. This service enables automatic command handling, event storage, and proper error handling in event sourcing applications.

**New exports:**

- `CommandProcessingService` - Effect service tag for command processing
- `CommandProcessingServiceInterface` - Service interface for command processing operations
- `createCommandProcessingService` - Factory function to create service implementations
- `CommandHandler` - Interface for individual command handlers
- `CommandRouter` - Interface for routing commands to appropriate handlers
- `CommandProcessingError` - Error type for general processing failures
- `CommandRoutingError` - Error type for command routing failures

**Key features:**

- **Complete command flow**: Automatically processes commands from ServerProtocol through to EventStore storage
- **Type-safe error handling**: Proper tagged errors with Effect error handling patterns
- **Flexible routing**: Simple Map-based command routing to handlers
- **Effect integration**: Seamless integration with EventStore and Effect ecosystem
- **Testing support**: Comprehensive test coverage with real EventStore integration

**Usage:**

```typescript
import {
  CommandProcessingService,
  createCommandProcessingService,
  CommandRouter
} from '@codeforbreakfast/eventsourcing-aggregates';

// Create command router
const router: CommandRouter = {
  route: (command) => // route to appropriate handler
};

// Create service layer
const CommandProcessingServiceLive = Layer.effect(
  CommandProcessingService,
  createCommandProcessingService(router)
);

// Use in application
const result = pipe(
  CommandProcessingService,
  Effect.flatMap(service => service.processCommand(command)),
  Effect.provide(CommandProcessingServiceLive)
);
```

This service completes the event sourcing architecture by connecting command handling to event storage with proper orchestration.
