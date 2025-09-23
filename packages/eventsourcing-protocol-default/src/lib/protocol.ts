import { Effect, Stream, Queue, Deferred, Duration } from 'effect';
import type { Client, TransportError } from '@codeforbreakfast/eventsourcing-transport-contracts';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport-contracts';
import type { EventStreamPosition } from '@codeforbreakfast/eventsourcing-store';

// Minimum protocol needs:
// 1. Send command -> get result
// 2. Subscribe to events
// That's fucking IT!

export interface Command {
  readonly id: string;
  readonly aggregate: string;
  readonly name: string;
  readonly payload: unknown;
}

export interface Event {
  readonly position: EventStreamPosition;
  readonly type: string;
  readonly data: unknown;
  readonly timestamp: Date;
}

export interface CommandResult {
  readonly success: boolean;
  readonly position?: EventStreamPosition;
  readonly error?: string;
}

interface ProtocolState {
  readonly pendingCommands: Map<string, Deferred.Deferred<CommandResult>>;
  readonly subscriptions: Map<string, Queue.Queue<Event>>;
}

export interface Protocol {
  readonly sendCommand: (command: Command) => Effect.Effect<CommandResult, TransportError, never>;
  readonly subscribe: (
    streamId: string
  ) => Effect.Effect<Stream.Stream<Event, never, never>, TransportError, never>;
}

const parseMessage = (message: any) => Effect.try(() => JSON.parse(message.payload));

const handleCommandResult = (state: ProtocolState) => (parsed: any) =>
  Effect.suspend(() => {
    const deferred = state.pendingCommands.get(parsed.commandId);
    if (!deferred) return Effect.void;

    state.pendingCommands.delete(parsed.commandId);
    return Deferred.succeed(deferred, {
      success: parsed.success,
      position: parsed.position,
      error: parsed.error,
    });
  });

const handleEvent = (state: ProtocolState) => (parsed: any) =>
  Effect.suspend(() => {
    const queue = state.subscriptions.get(parsed.streamId);
    if (!queue) return Effect.void;

    return Queue.offer(queue, {
      position: parsed.position,
      type: parsed.eventType,
      data: parsed.data,
      timestamp: new Date(parsed.timestamp),
    });
  });

const handleMessage = (state: ProtocolState) => (message: any) =>
  parseMessage(message).pipe(
    Effect.flatMap((parsed) => {
      switch (parsed.type) {
        case 'command_result':
          return handleCommandResult(state)(parsed);
        case 'event':
          return handleEvent(state)(parsed);
        default:
          return Effect.void;
      }
    }),
    Effect.catchAll(() => Effect.void)
  );

const createCommandSender =
  (state: ProtocolState, transport: Client.Transport) => (command: Command) =>
    Deferred.make<CommandResult>().pipe(
      Effect.tap((deferred) => Effect.sync(() => state.pendingCommands.set(command.id, deferred))),
      Effect.tap(() =>
        transport.publish(
          makeTransportMessage(
            command.id,
            'command',
            JSON.stringify({ type: 'command', ...command }),
            { timestamp: new Date().toISOString() }
          )
        )
      ),
      Effect.flatMap((deferred) =>
        Deferred.await(deferred).pipe(
          Effect.timeout(Duration.seconds(10)),
          Effect.catchTag('TimeoutException', () =>
            Effect.succeed({
              success: false,
              error: 'Command timed out',
            })
          )
        )
      )
    );

const createSubscriber =
  (state: ProtocolState, transport: Client.Transport) => (streamId: string) =>
    Queue.unbounded<Event>().pipe(
      Effect.tap((queue) => Effect.sync(() => state.subscriptions.set(streamId, queue))),
      Effect.tap(() =>
        transport.publish(
          makeTransportMessage(
            crypto.randomUUID(),
            'subscribe',
            JSON.stringify({ type: 'subscribe', streamId }),
            { timestamp: new Date().toISOString() }
          )
        )
      ),
      Effect.map(Stream.fromQueue)
    );

export const createProtocol = (
  transport: Client.Transport
): Effect.Effect<Protocol, TransportError, never> =>
  Effect.sync(() => ({
    pendingCommands: new Map<string, Deferred.Deferred<CommandResult>>(),
    subscriptions: new Map<string, Queue.Queue<Event>>(),
  })).pipe(
    Effect.flatMap((state) =>
      Effect.forkDaemon(
        transport
          .subscribe()
          .pipe(Effect.flatMap((stream) => Stream.runForEach(stream, handleMessage(state))))
      ).pipe(
        Effect.as({
          sendCommand: createCommandSender(state, transport),
          subscribe: createSubscriber(state, transport),
        })
      )
    )
  );
