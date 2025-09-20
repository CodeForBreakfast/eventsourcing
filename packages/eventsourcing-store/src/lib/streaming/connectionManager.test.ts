import { Effect } from 'effect';
import { describe, expect, it } from 'bun:test';
// Mock implementation for testing
import { Logger } from 'effect';
const LoggerLive = Logger.pretty;
import { 
  type ConnectionManagerService,
  DefaultConnectionConfig,
  makeConnectionManager
} from './connectionManager';

describe('ConnectionManager', () => {
  // Single minimal test to ensure the module loads
  it('should create a connection manager', async () => {
    // Create manager directly for testing
    const managerEffect = makeConnectionManager(DefaultConnectionConfig);
    const manager: ConnectionManagerService = await Effect.runPromise(Effect.provide(managerEffect, LoggerLive));
    expect(manager).toBeDefined();

    // Test the API port functionality
    const apiPortEffect = manager.getApiPort();
    const apiPort = await Effect.runPromise(Effect.provide(apiPortEffect, LoggerLive));
    expect(typeof apiPort).toBe('number');
  });
});