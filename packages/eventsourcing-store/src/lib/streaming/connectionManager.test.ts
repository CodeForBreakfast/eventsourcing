import { Effect, pipe } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { describe, expect, it, silentLogger } from '@codeforbreakfast/buntest';
import {
  ConnectionManagerService,
  DefaultConnectionConfig,
  makeConnectionManager,
} from './connectionManager';

const verifyApiPort = (manager: ReadonlyDeep<ConnectionManagerService>) =>
  pipe(
    manager.getApiPort(),
    Effect.provide(silentLogger),
    Effect.tap((apiPort) => Effect.sync(() => expect(typeof apiPort).toBe('number')))
  );

const verifyManagerAndApiPort = (manager: ReadonlyDeep<ConnectionManagerService>) =>
  // eslint-disable-next-line effect/no-eta-expansion -- Thunk required for Effect.sync to defer execution
  pipe(() => expect(manager).toBeDefined(), Effect.sync, Effect.andThen(verifyApiPort(manager)));

describe('ConnectionManager', () => {
  // Single minimal test to ensure the module loads
  it.effect('should create a connection manager', () =>
    pipe(
      DefaultConnectionConfig,
      makeConnectionManager,
      Effect.provide(silentLogger),
      Effect.flatMap(verifyManagerAndApiPort)
    )
  );
});
