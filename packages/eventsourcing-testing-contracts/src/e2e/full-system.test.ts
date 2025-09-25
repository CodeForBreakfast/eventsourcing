import { test, expect } from 'bun:test';
import { Effect, Layer, Stream, Data } from 'effect';
import { makeInMemoryStore } from '@codeforbreakfast/eventsourcing-store';

// Domain types for better type safety
interface TestCommand {
  readonly type: 'TestCommand';
  readonly data: { readonly value: string };
}

interface TestEvent {
  readonly type: 'TestEvent';
  readonly streamId: string;
  readonly data: unknown;
  readonly version: number;
}

// Proper tagged errors for domain failures
class EventSourcingClientError extends Data.TaggedError('EventSourcingClientError')<{
  readonly cause: string;
}> {}

class ServerProtocolHandlerError extends Data.TaggedError('ServerProtocolHandlerError')<{
  readonly cause: string;
}> {}

class EventPublisherError extends Data.TaggedError('EventPublisherError')<{
  readonly cause: string;
}> {}

// Service interfaces with proper domain types
interface EventSourcingClientInterface {
  readonly subscribeToStream: (
    streamId: string
  ) => Effect.Effect<Stream.Stream<TestEvent>, EventSourcingClientError, never>;
  readonly sendCommand: (
    command: TestCommand
  ) => Effect.Effect<void, EventSourcingClientError, never>;
  readonly disconnect: () => Effect.Effect<void, never, never>;
}

export class EventSourcingClient extends Effect.Tag('EventSourcingClient')<
  EventSourcingClient,
  EventSourcingClientInterface
>() {}

interface ServerProtocolHandlerInterface {
  readonly processCommand: (
    command: TestCommand
  ) => Effect.Effect<void, ServerProtocolHandlerError, never>;
}

export class ServerProtocolHandler extends Effect.Tag('ServerProtocolHandler')<
  ServerProtocolHandler,
  ServerProtocolHandlerInterface
>() {}

interface EventPublisherInterface {
  readonly publishEvents: (
    streamId: string,
    events: readonly TestEvent[]
  ) => Effect.Effect<void, EventPublisherError, never>;
  readonly subscribeToStream: (
    streamId: string
  ) => Effect.Effect<Stream.Stream<TestEvent>, EventPublisherError, never>;
}

export class EventPublisher extends Effect.Tag('EventPublisher')<
  EventPublisher,
  EventPublisherInterface
>() {}

// Pure service implementations that fail with proper tagged errors
const createEventSourcingClientService = (): EventSourcingClientInterface => ({
  subscribeToStream: (_streamId: string) => Effect.succeed(Stream.empty),
  sendCommand: (_command: TestCommand) =>
    Effect.fail(
      new EventSourcingClientError({
        cause: 'EventSourcingClient.sendCommand not implemented',
      })
    ),
  disconnect: () => Effect.void,
});

const createServerProtocolHandlerService = (): ServerProtocolHandlerInterface => ({
  processCommand: (_command: TestCommand) =>
    Effect.fail(
      new ServerProtocolHandlerError({
        cause: 'ServerProtocolHandler.processCommand not implemented',
      })
    ),
});

const createEventPublisherService = (): EventPublisherInterface => ({
  publishEvents: (_streamId: string, _events: readonly TestEvent[]) =>
    Effect.fail(
      new EventPublisherError({
        cause: 'EventPublisher.publishEvents not implemented',
      })
    ),
  subscribeToStream: (_streamId: string) =>
    Effect.fail(
      new EventPublisherError({
        cause: 'EventPublisher.subscribeToStream not implemented',
      })
    ),
});

// Layer definitions using pure functions
const EventSourcingClientLive = Layer.effect(
  EventSourcingClient,
  Effect.succeed(createEventSourcingClientService())
);

const ServerProtocolHandlerLive = Layer.effect(
  ServerProtocolHandler,
  Effect.succeed(createServerProtocolHandlerService())
);

const EventPublisherLive = Layer.effect(
  EventPublisher,
  Effect.succeed(createEventPublisherService())
);

// Composed layer stacks with proper naming
const ServerStackLive = Layer.mergeAll(ServerProtocolHandlerLive, EventPublisherLive);

const ClientStackLive = EventSourcingClientLive;

// Pure function to build server stack with store dependency
const buildServerStack = (
  _store: ReturnType<typeof makeInMemoryStore>
): Layer.Layer<ServerProtocolHandler | EventPublisher, never, never> => ServerStackLive;

// Pure function to create client operations using pipe composition
const createClientOperations = (
  streamId: string,
  testCommand: TestCommand,
  eventCollector: TestEvent[]
) =>
  EventSourcingClient.pipe(
    Effect.andThen((client) =>
      client.subscribeToStream(streamId).pipe(
        Effect.andThen((eventStream) =>
          client.sendCommand(testCommand).pipe(
            Effect.andThen(() =>
              Stream.take(eventStream, 1).pipe(
                Stream.runForEach((event) => Effect.sync(() => eventCollector.push(event)))
              )
            ),
            Effect.andThen(() => client.disconnect())
          )
        )
      )
    )
  );

// Pure function to run client with proper error handling
const runClientWithStack = (
  clientOps: Effect.Effect<void, EventSourcingClientError, EventSourcingClient>,
  stack: Layer.Layer<ServerProtocolHandler | EventPublisher | EventSourcingClient, never, never>
) => clientOps.pipe(Effect.provide(stack), Effect.runPromise);

test.skip('command processing generates events available to all subscribers', async () => {
  const sharedStore = makeInMemoryStore();
  const streamId = 'test-aggregate-123';
  const testCommand: TestCommand = {
    type: 'TestCommand',
    data: { value: 'test' },
  };
  const client1Events: TestEvent[] = [];
  const client2Events: TestEvent[] = [];

  const firstServerStack = buildServerStack(sharedStore);
  const fullFirstStack = Layer.mergeAll(firstServerStack, ClientStackLive);

  const client1Operations = createClientOperations(streamId, testCommand, client1Events);

  await runClientWithStack(client1Operations, fullFirstStack);

  const secondServerStack = buildServerStack(sharedStore);
  const fullSecondStack = Layer.mergeAll(secondServerStack, ClientStackLive);

  const client2Operations = createClientOperations(streamId, testCommand, client2Events);

  await runClientWithStack(client2Operations, fullSecondStack);

  expect(client1Events).toHaveLength(1);
  expect(client2Events).toHaveLength(1);
  expect(client1Events[0]).toEqual(client2Events[0]);
});
