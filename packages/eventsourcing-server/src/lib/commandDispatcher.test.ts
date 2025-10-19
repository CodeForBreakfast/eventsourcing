import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Option, pipe } from 'effect';
import { isCommandSuccess, isCommandFailure } from '@codeforbreakfast/eventsourcing-commands';
import { makeCommandDispatcher } from './commandDispatcher';
import { EventBusLive } from './eventBus';
import type { AggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

// Mock aggregate for testing
type TestEvent = { readonly type: 'Created'; readonly data: { readonly title: string } };
type TestState = { readonly title: string };

const createMockAggregate = (): AggregateRoot<
  string,
  TestState,
  TestEvent,
  string,
  {
    readonly createTest: (
      id: string,
      payload: { readonly title: string }
    ) => Effect.Effect<ReadonlyArray<TestEvent>, Error>;
  },
  unknown
> => ({
  new: () => ({ nextEventNumber: 0, data: Option.none() }),
  load: (_id: string) => Effect.succeed({ nextEventNumber: 0, data: Option.none() }),
  commit: (_options) => Effect.void,
  commands: {
    createTest: (
      _id: string,
      payload: { readonly title: string }
    ): Effect.Effect<ReadonlyArray<TestEvent>, Error> =>
      Effect.succeed([{ type: 'Created' as const, data: { title: payload.title } }]),
  },
});

const dispatchCreateCommand = (dispatcher: {
  readonly dispatch: (command: {
    readonly id: string;
    readonly name: string;
    readonly target: string;
    readonly payload: unknown;
  }) => Effect.Effect<unknown, never, unknown>;
}) =>
  dispatcher.dispatch({
    id: 'cmd-1',
    name: 'CreateTest',
    target: 'test-1',
    payload: { title: 'Test Title' },
  });

const dispatchUnknownCommand = (dispatcher: {
  readonly dispatch: (command: {
    readonly id: string;
    readonly name: string;
    readonly target: string;
    readonly payload: unknown;
  }) => Effect.Effect<unknown, never, unknown>;
}) =>
  dispatcher.dispatch({
    id: 'cmd-1',
    name: 'UnknownCommand',
    target: 'test-1',
    payload: {},
  });

const testCreateCommand = (
  mockAggregate: AggregateRoot<
    string,
    TestState,
    TestEvent,
    string,
    {
      readonly createTest: (
        id: string,
        payload: { readonly title: string }
      ) => Effect.Effect<ReadonlyArray<TestEvent>, Error>;
    },
    unknown
  >
) =>
  pipe(
    { aggregates: [{ root: mockAggregate }] },
    makeCommandDispatcher,
    Effect.flatMap(dispatchCreateCommand),
    Effect.provide(EventBusLive()),
    Effect.map((result) => {
      expect(isCommandSuccess(result)).toBe(true);
    })
  );

const testUnknownCommand = (
  mockAggregate: AggregateRoot<
    string,
    TestState,
    TestEvent,
    string,
    {
      readonly createTest: (
        id: string,
        payload: { readonly title: string }
      ) => Effect.Effect<ReadonlyArray<TestEvent>, Error>;
    },
    unknown
  >
) =>
  pipe(
    { aggregates: [{ root: mockAggregate }] },
    makeCommandDispatcher,
    Effect.flatMap(dispatchUnknownCommand),
    Effect.provide(EventBusLive()),
    Effect.map((result) => {
      expect(isCommandFailure(result)).toBe(true);
    })
  );

describe('CommandDispatcher', () => {
  it.effect('should route CreateTest command to createTest method', () =>
    pipe(createMockAggregate(), testCreateCommand)
  );

  it.effect('should fail for unknown command', () =>
    pipe(createMockAggregate(), testUnknownCommand)
  );
});
