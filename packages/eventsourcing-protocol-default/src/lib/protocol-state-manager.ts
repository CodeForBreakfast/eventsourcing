/**
 * Protocol State Manager
 *
 * Manages protocol state including active subscriptions, pending commands,
 * and message correlation. This is the stateful core of the protocol implementation.
 */

import { Effect, Ref, Map, Stream, Queue, Exit, Deferred } from 'effect';
import {
  type StreamSubscription,
  type StreamEvent,
  type CommandResult,
  type RequestContext,
  StreamError,
  CommandError,
} from '@codeforbreakfast/eventsourcing-protocol-contracts';
import {
  type EventStreamId,
  type EventStreamPosition,
} from '@codeforbreakfast/eventsourcing-store';

// ============================================================================
// State Types
// ============================================================================

/**
 * State of an active subscription.
 */
interface SubscriptionState {
  readonly streamId: EventStreamId;
  readonly queue: Queue.Queue<StreamEvent<unknown>>;
  readonly currentPosition: EventStreamPosition;
  readonly subscribedAt: Date;
  readonly isActive: boolean;
}

/**
 * State of a pending command waiting for a result.
 */
interface PendingCommand {
  readonly commandId: string;
  readonly deferred: Deferred.Deferred<CommandResult, never>;
  readonly sentAt: Date;
  readonly timeoutMs?: number;
  readonly context?: RequestContext;
}

/**
 * Overall protocol state.
 */
interface ProtocolState {
  readonly subscriptions: Map.Map<EventStreamId, SubscriptionState>;
  readonly pendingCommands: Map.Map<string, PendingCommand>;
  readonly messageCorrelations: Map.Map<string, string>; // correlationId -> commandId or subscriptionId
}

// ============================================================================
// Protocol State Manager Implementation
// ============================================================================

export class ProtocolStateManager<TEvent> {
  constructor(private readonly state: Ref.Ref<ProtocolState>) {}

  // ========================================================================
  // Subscription Management
  // ========================================================================

  /**
   * Create a new subscription for a stream.
   */
  createSubscription = (
    streamId: EventStreamId,
    position: EventStreamPosition,
    correlationId?: string
  ): Effect.Effect<Stream.Stream<StreamEvent<TEvent>, StreamError, never>, StreamError, never> =>
    Effect.gen(this, function* () {
      // Create queue for events
      const queue = yield* Queue.unbounded<StreamEvent<TEvent>>();

      // Create subscription state
      const subscriptionState: SubscriptionState = {
        streamId,
        queue: queue as Queue.Queue<StreamEvent<unknown>>,
        currentPosition: position,
        subscribedAt: new Date(),
        isActive: true,
      };

      // Update state
      yield* Ref.update(this.state, (current) => ({
        ...current,
        subscriptions: Map.set(current.subscriptions, streamId, subscriptionState),
        ...(correlationId && {
          messageCorrelations: Map.set(current.messageCorrelations, correlationId, streamId),
        }),
      }));

      // Return stream from queue
      return Stream.fromQueue(queue).pipe(
        Stream.takeUntil(
          // Stop stream when subscription is no longer active
          Effect.gen(this, function* () {
            const state = yield* Ref.get(this.state);
            const subscription = Map.get(state.subscriptions, streamId);
            return !subscription?.isActive;
          })
        )
      );
    });

  /**
   * Add an event to a subscription's queue.
   */
  addEventToSubscription = (
    streamId: EventStreamId,
    event: StreamEvent<TEvent>
  ): Effect.Effect<void, StreamError, never> =>
    Effect.gen(this, function* () {
      const state = yield* Ref.get(this.state);
      const subscription = Map.get(state.subscriptions, streamId);

      if (!subscription || !subscription.isActive) {
        return yield* Effect.fail(
          new StreamError({
            message: `No active subscription found for stream: ${streamId}`,
            streamId,
          })
        );
      }

      // Add event to queue
      yield* Queue.offer(subscription.queue as Queue.Queue<StreamEvent<TEvent>>, event);

      // Update position
      yield* Ref.update(this.state, (current) => ({
        ...current,
        subscriptions: Map.set(current.subscriptions, streamId, {
          ...subscription,
          currentPosition: event.position,
        }),
      }));
    });

  /**
   * End a subscription.
   */
  endSubscription = (
    streamId: EventStreamId,
    reason?: string
  ): Effect.Effect<void, StreamError, never> =>
    Effect.gen(this, function* () {
      const state = yield* Ref.get(this.state);
      const subscription = Map.get(state.subscriptions, streamId);

      if (!subscription) {
        return yield* Effect.fail(
          new StreamError({
            message: `No subscription found for stream: ${streamId}`,
            streamId,
          })
        );
      }

      // Shutdown queue
      yield* Queue.shutdown(subscription.queue);

      // Update state
      yield* Ref.update(this.state, (current) => ({
        ...current,
        subscriptions: Map.set(current.subscriptions, streamId, {
          ...subscription,
          isActive: false,
        }),
      }));
    });

  /**
   * Get all active subscriptions.
   */
  getActiveSubscriptions = (): Effect.Effect<readonly StreamSubscription[], never, never> =>
    Effect.gen(this, function* () {
      const state = yield* Ref.get(this.state);
      const subscriptions: StreamSubscription[] = [];

      for (const [streamId, subscription] of state.subscriptions) {
        if (subscription.isActive) {
          subscriptions.push({
            streamId,
            currentPosition: subscription.currentPosition,
            isActive: subscription.isActive,
            subscribedAt: subscription.subscribedAt,
          });
        }
      }

      return subscriptions;
    });

  // ========================================================================
  // Command Management
  // ========================================================================

  /**
   * Register a pending command and return a deferred for the result.
   */
  registerPendingCommand = (
    commandId: string,
    correlationId?: string,
    timeoutMs?: number,
    context?: RequestContext
  ): Effect.Effect<Deferred.Deferred<CommandResult, never>, never, never> =>
    Effect.gen(this, function* () {
      const deferred = yield* Deferred.make<CommandResult, never>();

      const pendingCommand: PendingCommand = {
        commandId,
        deferred,
        sentAt: new Date(),
        timeoutMs,
        context,
      };

      // Update state
      yield* Ref.update(this.state, (current) => ({
        ...current,
        pendingCommands: Map.set(current.pendingCommands, commandId, pendingCommand),
        ...(correlationId && {
          messageCorrelations: Map.set(current.messageCorrelations, correlationId, commandId),
        }),
      }));

      return deferred;
    });

  /**
   * Complete a pending command with a result.
   */
  completePendingCommand = (
    commandId: string,
    result: CommandResult
  ): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      const state = yield* Ref.get(this.state);
      const pendingCommand = Map.get(state.pendingCommands, commandId);

      if (!pendingCommand) {
        // Command not found or already completed - ignore
        return;
      }

      // Complete the deferred
      yield* Deferred.succeed(pendingCommand.deferred, result);

      // Remove from state
      yield* Ref.update(this.state, (current) => ({
        ...current,
        pendingCommands: Map.remove(current.pendingCommands, commandId),
      }));
    });

  /**
   * Complete a pending command via correlation ID.
   */
  completePendingCommandByCorrelation = (
    correlationId: string,
    result: CommandResult
  ): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      const state = yield* Ref.get(this.state);
      const commandId = Map.get(state.messageCorrelations, correlationId);

      if (commandId) {
        yield* this.completePendingCommand(commandId, result);
        // Clean up correlation
        yield* Ref.update(this.state, (current) => ({
          ...current,
          messageCorrelations: Map.remove(current.messageCorrelations, correlationId),
        }));
      }
    });

  /**
   * Cleanup expired commands based on timeout.
   */
  cleanupExpiredCommands = (): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      const now = Date.now();
      const state = yield* Ref.get(this.state);
      const expiredCommands: string[] = [];

      for (const [commandId, command] of state.pendingCommands) {
        if (command.timeoutMs && now - command.sentAt.getTime() > command.timeoutMs) {
          expiredCommands.push(commandId);
        }
      }

      // Complete expired commands with timeout error
      for (const commandId of expiredCommands) {
        const timeoutResult: CommandResult = {
          _tag: 'Left',
          left: {
            _tag: 'CommandError',
            message: 'Command timed out',
            details: { reason: 'timeout', commandId },
          },
        };
        yield* this.completePendingCommand(commandId, timeoutResult);
      }
    });

  // ========================================================================
  // State Queries
  // ========================================================================

  /**
   * Get current protocol state snapshot.
   */
  getState = (): Effect.Effect<ProtocolState, never, never> => Ref.get(this.state);

  /**
   * Reset all state (useful for cleanup/disconnection).
   */
  reset = (): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      const state = yield* Ref.get(this.state);

      // Shutdown all subscription queues
      for (const [, subscription] of state.subscriptions) {
        yield* Queue.shutdown(subscription.queue);
      }

      // Fail all pending commands
      for (const [commandId, command] of state.pendingCommands) {
        const disconnectResult: CommandResult = {
          _tag: 'Left',
          left: {
            _tag: 'CommandError',
            message: 'Protocol disconnected',
            details: { reason: 'disconnect', commandId },
          },
        };
        yield* Deferred.succeed(command.deferred, disconnectResult);
      }

      // Reset state
      yield* Ref.set(this.state, {
        subscriptions: Map.empty(),
        pendingCommands: Map.empty(),
        messageCorrelations: Map.empty(),
      });
    });
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new protocol state manager.
 */
export const createProtocolStateManager = <TEvent>(): Effect.Effect<
  ProtocolStateManager<TEvent>,
  never,
  never
> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<ProtocolState>({
      subscriptions: Map.empty(),
      pendingCommands: Map.empty(),
      messageCorrelations: Map.empty(),
    });

    return new ProtocolStateManager<TEvent>(state);
  });

// ============================================================================
// Service Tag - Modern Effect Pattern
// ============================================================================

/**
 * Service interface for the protocol state manager.
 */
export interface ProtocolStateManagerInterface<TEvent = unknown> {
  readonly createSubscription: (
    streamId: EventStreamId,
    position: EventStreamPosition,
    correlationId?: string
  ) => Effect.Effect<Stream.Stream<StreamEvent<TEvent>, StreamError, never>, StreamError, never>;

  readonly addEventToSubscription: (
    streamId: EventStreamId,
    event: StreamEvent<TEvent>
  ) => Effect.Effect<void, StreamError, never>;

  readonly endSubscription: (
    streamId: EventStreamId,
    reason?: string
  ) => Effect.Effect<void, StreamError, never>;

  readonly getActiveSubscriptions: () => Effect.Effect<readonly StreamSubscription[], never, never>;

  readonly registerPendingCommand: (
    commandId: string,
    correlationId?: string,
    timeoutMs?: number,
    context?: RequestContext
  ) => Effect.Effect<Deferred.Deferred<CommandResult, never>, never, never>;

  readonly completePendingCommand: (
    commandId: string,
    result: CommandResult
  ) => Effect.Effect<void, never, never>;

  readonly completePendingCommandByCorrelation: (
    correlationId: string,
    result: CommandResult
  ) => Effect.Effect<void, never, never>;

  readonly cleanupExpiredCommands: () => Effect.Effect<void, never, never>;

  readonly reset: () => Effect.Effect<void, never, never>;
}

/**
 * Service tag for ProtocolStateManager.
 */
export class ProtocolStateManagerService<TEvent = unknown> extends Effect.Tag(
  '@eventsourcing/ProtocolStateManager'
)<ProtocolStateManagerService<TEvent>, ProtocolStateManagerInterface<TEvent>>() {}

/**
 * Layer that provides the protocol state manager.
 */
export const ProtocolStateManagerLive = <TEvent>() =>
  Effect.Layer.effect(ProtocolStateManagerService<TEvent>, createProtocolStateManager<TEvent>());
