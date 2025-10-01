import { Effect, pipe } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { describe, expect, it, silentLogger } from '@codeforbreakfast/buntest';
// Mock implementation for testing
const LoggerLive = silentLogger;
import {
  ConnectionManagerService,
  DefaultConnectionConfig,
  makeConnectionManager,
} from './connectionManager';

describe('ConnectionManager', () => {
  // Single minimal test to ensure the module loads
  it.effect('should create a connection manager', () =>
    pipe(
      makeConnectionManager(DefaultConnectionConfig),
      Effect.provide(LoggerLive),
      Effect.flatMap((manager: ReadonlyDeep<ConnectionManagerService>) =>
        pipe(
          Effect.sync(() => expect(manager).toBeDefined()),
          Effect.flatMap(() =>
            pipe(
              manager.getApiPort(),
              Effect.provide(LoggerLive),
              Effect.tap((apiPort) => Effect.sync(() => expect(typeof apiPort).toBe('number')))
            )
          )
        )
      )
    )
  );
});
