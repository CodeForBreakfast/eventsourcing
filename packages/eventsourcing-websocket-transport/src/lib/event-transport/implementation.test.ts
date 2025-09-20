/**
 * Tests for WebSocket Event Transport Implementation
 */

import { describe, it, expect } from 'bun:test';
import { Effect, Exit, Schema, Cause, Stream, pipe } from 'effect';
import type { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import { WebSocketUrlSchema } from '../../index';
import {
  createWebSocketEventTransport,
  createWebSocketEventTransportService,
  WebSocketEventTransportServiceLive,
} from './implementation';
import { WebSocketEventTransportService } from './interface';
import { TransportSubscriptionError } from './types';

describe('WebSocketEventTransport', () => {
  describe('factory functions', () => {
    it('should create transport with default config', async () => {
      const transport = await Effect.runPromise(
        createWebSocketEventTransport(),
      );

      expect(transport).toBeDefined();
      expect(transport.connect).toBeDefined();
      expect(transport.disconnect).toBeDefined();
      expect(transport.subscribeToStream).toBeDefined();
      expect(transport.subscribeToStreams).toBeDefined();
      expect(transport.sendCommand).toBeDefined();
      expect(transport.connectionStatus).toBeDefined();
      expect(transport.isConnected).toBeDefined();
    });

    it('should create transport with custom config', async () => {
      const config = {
        maxReconnectAttempts: 10,
        reconnectDelayMs: 500,
        autoReconnect: false,
      };

      const transport = await Effect.runPromise(
        createWebSocketEventTransport(config),
      );

      expect(transport).toBeDefined();
      expect(transport.connect).toBeDefined();
    });
  });

  describe('connection state', () => {
    it('should start in disconnected state', async () => {
      const transport = await Effect.runPromise(
        createWebSocketEventTransport(),
      );

      const isConnected = await Effect.runPromise(transport.isConnected());
      expect(isConnected).toBe(false);
    });

    it('should fail to subscribe when not connected', async () => {
      const transport = await Effect.runPromise(
        createWebSocketEventTransport(),
      );
      const streamId = 'test-stream' as EventStreamId;

      const result = await Effect.runPromiseExit(
        Effect.gen(function* (_) {
          const stream = transport.subscribeToStream(streamId);
          return yield* _(stream.pipe(Stream.take(1), Stream.runCollect));
        }),
      );

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const cause = result.cause;
        if (
          Cause.isFailType(cause) &&
          cause.error instanceof TransportSubscriptionError
        ) {
          expect(cause.error).toBeInstanceOf(TransportSubscriptionError);
          expect(cause.error.reason).toBe('Not connected');
        }
      }
    });

    it('should fail to send command when not connected', async () => {
      const transport = await Effect.runPromise(
        createWebSocketEventTransport(),
      );

      const command = {
        aggregateId: 'test-123',
        aggregateName: 'TestAggregate',
        commandName: 'TestCommand',
        payload: { value: 'test' },
      };

      const result = await Effect.runPromiseExit(
        transport.sendCommand(command),
      );

      expect(Exit.isFailure(result)).toBe(true);
    });
  });

  describe('service layer', () => {
    it('should create transport service', async () => {
      const service = createWebSocketEventTransportService();

      expect(service).toBeDefined();
      expect(service.create).toBeDefined();
      expect(service.createWithConfig).toBeDefined();

      // Test create method
      const transport1 = await Effect.runPromise(service.create());
      expect(transport1).toBeDefined();
      expect(transport1.connect).toBeDefined();

      // Test createWithConfig method
      const transport2 = await Effect.runPromise(
        service.createWithConfig({
          autoReconnect: false,
          maxReconnectAttempts: 3,
        }),
      );
      expect(transport2).toBeDefined();
      expect(transport2.connect).toBeDefined();
    });

    it('should provide live layer', () => {
      const layer = WebSocketEventTransportServiceLive();

      expect(layer).toBeDefined();
      // The layer is a function that returns a Layer
      expect(typeof layer).toBe('object');
    });

    it('should work with Effect dependency injection', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* _(WebSocketEventTransportService);
        const transport = yield* _(service.create());
        return transport;
      });

      const layer = WebSocketEventTransportServiceLive();
      const transport = await Effect.runPromise(
        program.pipe(Effect.provide(layer)),
      );

      expect(transport).toBeDefined();
      expect(transport.connect).toBeDefined();
    });
  });

  describe('protocol validation', () => {
    it('should validate WebSocket URL format', async () => {
      const validUrls = [
        'ws://localhost:8080',
        'wss://example.com',
        'ws://192.168.1.1:3000/path',
        'wss://subdomain.example.com:443',
      ];

      await Effect.runPromise(
        Effect.forEach(validUrls, (url) =>
          Schema.decodeUnknown(WebSocketUrlSchema)(url),
        ),
      );
    });

    it('should reject invalid WebSocket URLs', async () => {
      const invalidUrls = [
        'http://localhost:8080',
        'https://example.com',
        'tcp://localhost:3000',
        'localhost:8080',
        'ws://',
        'wss://',
      ];

      await Effect.runPromise(
        Effect.forEach(invalidUrls, (url) =>
          pipe(
            Schema.decodeUnknown(WebSocketUrlSchema)(url),
            Effect.match({
              onFailure: () => undefined, // Expected - validation should fail
              onSuccess: () => {
                expect(`URL should be invalid: ${url}`).toBe(
                  'but it was valid',
                );
              },
            }),
          ),
        ),
      );
    });
  });
});
