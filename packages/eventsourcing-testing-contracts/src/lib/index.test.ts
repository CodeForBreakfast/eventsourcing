/**
 * Basic smoke tests for the testing contracts package
 */

import { describe, it, expect } from 'bun:test';
import { Effect, Stream, pipe } from 'effect';
import {
  generateStreamId,
  createTestCommand,
  createMockTransport,
  createMockDomainContext,
  TestScenarios,
} from '../index.js';

describe('Testing Contracts Package', () => {
  describe('Test Data Generators', () => {
    it('should generate unique stream IDs', () => {
      const id1 = generateStreamId();
      const id2 = generateStreamId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^test-stream-/);
    });

    it('should create test commands', () => {
      const command = createTestCommand(
        { action: 'test', value: 42 },
        { commandName: 'TestCommand' }
      );

      expect(command.commandName).toBe('TestCommand');
      expect(command.payload).toEqual({ action: 'test', value: 42 });
      expect(command.aggregate.name).toBe('TestAggregate');
    });
  });

  describe('Mock Implementations', () => {
    it('should create mock transport', async () => {
      const transportContext = await Effect.runPromise(createMockTransport());

      expect(typeof transportContext.createConnectedTransport).toBe('function');
      expect(typeof transportContext.simulateDisconnect).toBe('function');
      expect(typeof transportContext.simulateReconnect).toBe('function');

      // Test basic functionality - create a connected transport and test it
      await Effect.runPromise(
        Effect.scoped(
          pipe(
            transportContext.createConnectedTransport('test://localhost'),
            Effect.flatMap((connectedTransport) =>
              pipe(
                connectedTransport.connectionState,
                Stream.take(1),
                Stream.runHead,
                Effect.tap((state) => {
                  expect(state._tag).toBe('Some');
                  return Effect.void;
                })
              )
            )
          )
        )
      );
    });

    it('should create mock domain context', async () => {
      const domain = await Effect.runPromise(createMockDomainContext());

      expect(typeof domain.processCommand).toBe('function');
      expect(typeof domain.getEventCount).toBe('function');

      // Test basic functionality
      const streamId = generateStreamId();
      const count = await Effect.runPromise(domain.getEventCount(streamId));
      expect(count).toBe(0);
    });
  });

  describe('Test Scenarios', () => {
    it('should provide basic command flow scenario', async () => {
      const domain = await Effect.runPromise(createMockDomainContext());

      const result = await Effect.runPromise(TestScenarios.basicCommandFlow(domain.processCommand));

      expect(result).toBeDefined();
    });

    it('should provide optimistic concurrency scenario', async () => {
      const domain = await Effect.runPromise(createMockDomainContext());

      const { result1, result2 } = await Effect.runPromise(
        TestScenarios.optimisticConcurrency(domain.processCommand)
      );

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });
});
