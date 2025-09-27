import { Effect } from 'effect';
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
    Effect.gen(function* () {
      // Create manager directly for testing
      const managerEffect = makeConnectionManager(DefaultConnectionConfig);
      const manager: ConnectionManagerService = yield* Effect.provide(managerEffect, LoggerLive);
      expect(manager).toBeDefined();

      // Test the API port functionality
      const apiPortEffect = manager.getApiPort();
      const apiPort = yield* Effect.provide(apiPortEffect, LoggerLive);
      expect(typeof apiPort).toBe('number');
    })
  );
});
