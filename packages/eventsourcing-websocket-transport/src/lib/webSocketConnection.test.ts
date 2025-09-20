import { describe, test, expect, mock } from 'bun:test';
import { Effect, pipe, Stream, Chunk, Schema } from 'effect';
import { createWebSocketConnection } from './webSocketConnection';
import { WebSocketUrl, OutgoingMessage } from './types';

// Helper to create valid WebSocketUrl for tests
const makeWebSocketUrl = (url: string) =>
  Effect.orDie(Schema.decodeUnknown(WebSocketUrl)(url));

// Helper to create valid OutgoingMessage for tests
const makeOutgoingMessage = (msg: string) =>
  Effect.orDie(Schema.decodeUnknown(OutgoingMessage)(msg));

// Mock WebSocket for testing
/* eslint-disable functional/no-classes, functional/no-this-expressions */
class MockWebSocket {
  readyState = 0; // CONNECTING
  protocol = '';
  extensions = '';

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  send = mock();
  close = mock();

  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }

  simulateClose() {
    this.readyState = 3; // CLOSED
    this.onclose?.(new CloseEvent('close'));
  }
}
/* eslint-enable functional/no-classes, functional/no-this-expressions */

// Replace global WebSocket with mock
let mockWebSocket: MockWebSocket;
globalThis.WebSocket = function (_url: string) {
  mockWebSocket = new MockWebSocket();
  return mockWebSocket as unknown;
} as unknown as typeof WebSocket;

describe('State-Based WebSocket', () => {
  describe('State Transitions', () => {
    test('transitions from disconnected to connecting', () =>
      pipe(
        Effect.all({
          socket: createWebSocketConnection(),
          url: makeWebSocketUrl('ws://localhost:1234'),
        }),
        Effect.flatMap(({ socket, url }) => socket.connect(url)),
        Effect.map((connecting) => {
          expect(connecting._tag).toBe('connecting');
          expect(connecting.url).toBe('ws://localhost:1234' as WebSocketUrl);
          // Type-level proof: only wait and abort are available
          expect(typeof connecting.wait).toBe('function');
          expect(typeof connecting.abort).toBe('function');
          // @ts-expect-error - send doesn't exist on connecting socket
          expect(connecting.send).toBeUndefined();
        }),
        Effect.runPromise,
      ));

    test('transitions from connecting to connected', async () => {
      const socket = await Effect.runPromise(createWebSocketConnection());
      const url = await Effect.runPromise(
        makeWebSocketUrl('ws://localhost:1234'),
      );

      const connecting = await Effect.runPromise(socket.connect(url));
      expect(connecting._tag).toBe('connecting');

      // Start waiting in background
      const waitPromise = Effect.runPromise(connecting.wait());

      // Simulate open after a small delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockWebSocket.simulateOpen();

      // Wait for connection
      const connected = await waitPromise;

      expect(connected._tag).toBe('connected');
      expect(connected.info.url).toBe('ws://localhost:1234' as WebSocketUrl);
      expect(typeof connected.send).toBe('function');
      expect(typeof connected.receive).toBe('function');
      expect(typeof connected.disconnect).toBe('function');
      // @ts-expect-error - connect doesn't exist on connected socket
      expect(connected.connect).toBeUndefined();
    });

    test('transitions from connected back to disconnected', async () => {
      const socket = await Effect.runPromise(createWebSocketConnection());
      const url = await Effect.runPromise(
        makeWebSocketUrl('ws://localhost:1234'),
      );

      const connecting = await Effect.runPromise(socket.connect(url));

      // Start waiting and simulate open
      const waitPromise = Effect.runPromise(connecting.wait());
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockWebSocket.simulateOpen();

      const connected = await waitPromise;
      const disconnected = await Effect.runPromise(connected.disconnect());

      expect(disconnected._tag).toBe('disconnected');
      expect(typeof disconnected.connect).toBe('function');
    });

    test('can abort connection attempt', () =>
      pipe(
        Effect.all({
          socket: createWebSocketConnection(),
          url: makeWebSocketUrl('ws://localhost:1234'),
        }),
        Effect.flatMap(({ socket, url }) =>
          pipe(
            socket.connect(url),
            Effect.flatMap((connecting) => connecting.abort()),
          ),
        ),
        Effect.map((disconnected) => {
          expect(disconnected._tag).toBe('disconnected');
          expect(mockWebSocket.close).toHaveBeenCalledWith(
            1000,
            'Connection aborted',
          );
        }),
        Effect.runPromise,
      ));
  });

  describe('Connected Operations', () => {
    const setupConnectedSocket = async () => {
      const socket = await Effect.runPromise(createWebSocketConnection());
      const url = await Effect.runPromise(
        makeWebSocketUrl('ws://localhost:1234'),
      );

      const connecting = await Effect.runPromise(socket.connect(url));

      // Start waiting and simulate open
      const waitPromise = Effect.runPromise(connecting.wait());
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockWebSocket.simulateOpen();

      return await waitPromise;
    };

    test('can send messages when connected', async () => {
      const connected = await setupConnectedSocket();
      const message = await Effect.runPromise(
        makeOutgoingMessage('Hello, WebSocket!'),
      );

      const result = await Effect.runPromise(connected.send(message));

      expect(result.message).toBe('Hello, WebSocket!' as OutgoingMessage);
      expect(result.messageId).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(result.bytesSize).toBe(17);
      expect(mockWebSocket.send).toHaveBeenCalledWith('Hello, WebSocket!');
    });

    test('can receive messages when connected', async () => {
      const connected = await setupConnectedSocket();

      // Start collecting messages in the background
      const collectPromise = Effect.runPromise(
        pipe(
          connected.receive(),
          Stream.take(2),
          Stream.runCollect,
          Effect.map((messages) => Chunk.toArray(messages)),
        ),
      );

      // Send messages after a small delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockWebSocket.simulateMessage('Message 1');
      mockWebSocket.simulateMessage('Message 2');

      const messages = await collectPromise;
      expect(messages).toEqual(['Message 1', 'Message 2']);
    });

    test('can get metrics when connected', async () => {
      const connected = await setupConnectedSocket();
      const message = await Effect.runPromise(
        makeOutgoingMessage('Test message'),
      );

      await Effect.runPromise(connected.send(message));
      const metrics = await Effect.runPromise(connected.metrics());

      expect(metrics.connectionAttempts).toBe(1);
      expect(metrics.successfulConnections).toBe(1);
      expect(metrics.messagesSent).toBe(1);
      expect(metrics.bytesSent).toBe(12);
    });

    test('handles connection errors', async () => {
      const socket = await Effect.runPromise(createWebSocketConnection());
      const url = await Effect.runPromise(
        makeWebSocketUrl('ws://localhost:1234'),
      );

      const connecting = await Effect.runPromise(socket.connect(url));

      // Start waiting and simulate error
      const waitPromise = Effect.runPromise(connecting.wait());
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockWebSocket.simulateError();

      // eslint-disable-next-line functional/no-try-statements
      try {
        await waitPromise;
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        // Effect.runPromise wraps errors in FiberFailure
        // The error message is generic but we know it's a connection error
        expect((error as Error).message).toBe('An error has occurred');
      }
    });
  });
});
