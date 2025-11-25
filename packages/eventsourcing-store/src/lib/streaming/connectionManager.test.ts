import { Effect, pipe } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { describe, expectTrue, it, silentLogger } from '@codeforbreakfast/bun-test-effect';
import {
  ConnectionManagerService,
  DefaultConnectionConfig,
  makeConnectionManager,
} from './connectionManager';

const verifyApiPortIsNumber = expectTrue('Expected apiPort to be a number');

const verifyApiPort = (manager: ReadonlyDeep<ConnectionManagerService>) =>
  pipe(
    manager.getApiPort(),
    Effect.provide(silentLogger),
    Effect.flatMap((apiPort) => verifyApiPortIsNumber(typeof apiPort === 'number'))
  );

const verifyManagerIsDefined = expectTrue('Expected manager to be defined');

const verifyManagerAndApiPort = (manager: ReadonlyDeep<ConnectionManagerService>) =>
  pipe(
    manager,
    (m) => m !== undefined,
    verifyManagerIsDefined,
    Effect.andThen(verifyApiPort(manager))
  );

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
