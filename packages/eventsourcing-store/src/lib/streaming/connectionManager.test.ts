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

const verifyApiPort = (manager: ReadonlyDeep<ConnectionManagerService>) =>
  pipe(
    manager.getApiPort(),
    Effect.provide(LoggerLive),
    Effect.tap((apiPort) => Effect.sync(() => expect(typeof apiPort).toBe('number')))
  );

const verifyManagerAndApiPort = (manager: ReadonlyDeep<ConnectionManagerService>) =>
  pipe(
    () => expect(manager).toBeDefined(),
    Effect.sync,
    Effect.flatMap(() => verifyApiPort(manager))
  );

describe('ConnectionManager', () => {
  // Single minimal test to ensure the module loads
  it.effect('should create a connection manager', () =>
    pipe(
      DefaultConnectionConfig,
      makeConnectionManager,
      Effect.provide(LoggerLive),
      Effect.flatMap(verifyManagerAndApiPort)
    )
  );
});
