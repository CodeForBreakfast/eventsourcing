import { Effect, pipe } from 'effect';
import { describe, expect, it, silentLogger } from '@codeforbreakfast/buntest';
// Mock implementation for testing
const LoggerLive = silentLogger;
import {
  type ConnectionManagerService,
  DefaultConnectionConfig,
  makeConnectionManager,
} from './connectionManager';

describe('ConnectionManager', () => {
  // Single minimal test to ensure the module loads
  it.effect('should create a connection manager', () =>
    pipe(
      makeConnectionManager(DefaultConnectionConfig),
      Effect.provide(LoggerLive),
      Effect.flatMap((manager: ConnectionManagerService) =>
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
