/**
 * WebSocket Transport Implementation Tests
 *
 * Tests WebSocket-specific implementation details, error scenarios, and mock factory behavior.
 * Generic transport behaviors are covered by contract tests.
 */

import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, pipe, Stream, Layer, Option } from 'effect';
import * as Socket from '@effect/platform/Socket';
import { ConnectionError, makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';
import { WebSocketConnector } from './websocket-transport';

// =============================================================================
// Test Socket Implementation
// =============================================================================

interface TestSocketConfig {
  readonly shouldFailConnection?: boolean;
  readonly shouldFailBeforeOpen?: boolean;
  readonly shouldCloseBeforeOpen?: boolean;
  readonly openDelay?: number;
  readonly preloadedMessages?: readonly Uint8Array[];
  readonly shouldFailOnWrite?: boolean;
}

// WebSocket state constants
const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

// Mock WebSocket factory that behaves like a real WebSocket for Socket.makeWebSocket
const createMockWebSocket = (
  url: string,
  _protocols?: string | readonly string[],
  config: TestSocketConfig = {}
): Readonly<globalThis.WebSocket> => {
  // Mutable state for the mock (contained within closure)
  let readyState: number = WebSocketState.CONNECTING;
  let openTimeout: NodeJS.Timeout | undefined;
  const eventListeners = new Map<string, readonly ((event: unknown) => void)[]>();

  const dispatchEvent = (event: unknown): boolean => {
    const listeners = eventListeners.get((event as { readonly type: string }).type);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
    return true;
  };

  const simulateConnection = () => {
    if (config.shouldFailConnection || config.shouldFailBeforeOpen) {
      dispatchEvent({ type: 'error', error: new Error('Connection failed') });
      readyState = WebSocketState.CLOSED;
      return;
    }

    if (config.shouldCloseBeforeOpen) {
      dispatchEvent({ type: 'close', code: 1006, reason: 'Connection refused' });
      readyState = WebSocketState.CLOSED;
      return;
    }

    const openDelay = config.openDelay ?? 0;
    openTimeout = setTimeout(() => {
      readyState = WebSocketState.OPEN;
      dispatchEvent({ type: 'open' });

      // Send preloaded messages if configured
      if (config.preloadedMessages) {
        setTimeout(() => {
          config.preloadedMessages!.forEach((message) => {
            dispatchEvent({ type: 'message', data: message });
          });
        }, 100);
      }
    }, openDelay);
  };

  // Start connection simulation with delay to allow 'connecting' state to be observed
  setTimeout(() => simulateConnection(), 50);

  // Return WebSocket-compatible object
  return {
    url,
    protocol: '',
    get readyState() {
      return readyState;
    },
    bufferedAmount: 0,
    extensions: '',
    binaryType: 'blob' as 'blob' | 'arraybuffer',

    // WebSocket constants
    CONNECTING: WebSocketState.CONNECTING,
    OPEN: WebSocketState.OPEN,
    CLOSING: WebSocketState.CLOSING,
    CLOSED: WebSocketState.CLOSED,

    addEventListener(type: string, listener: (event: unknown) => void) {
      const currentListeners = eventListeners.get(type) ?? [];
      eventListeners.set(type, [...currentListeners, listener]);
    },

    removeEventListener(type: string, listener: (event: unknown) => void) {
      const listeners = eventListeners.get(type);
      if (listeners) {
        const filteredListeners = listeners.filter((l) => l !== listener);
        eventListeners.set(type, filteredListeners);
      }
    },

    dispatchEvent,

    send(_data: string | ArrayBuffer | Blob | ArrayBufferView) {
      if (readyState !== WebSocketState.OPEN) {
        throw new Error('WebSocket is not open');
      }
      if (config.shouldFailOnWrite) {
        throw new Error('Send failed');
      }
      // In a real implementation, this would send data to the server
    },

    close(code?: number, reason?: string) {
      if (openTimeout) {
        clearTimeout(openTimeout);
      }
      readyState = WebSocketState.CLOSED;
      dispatchEvent({ type: 'close', code: code ?? 1000, reason: reason ?? '' });
    },

    // Event handler properties
    onopen: null,
    onclose: null,
    onmessage: null,
    onerror: null,
  } as globalThis.WebSocket;
};

// Test WebSocketConstructor that creates MockWebSockets
const createTestWebSocketConstructor =
  (config: TestSocketConfig) =>
  (url: string, protocols?: string | readonly string[]): Readonly<globalThis.WebSocket> => {
    return createMockWebSocket(url, protocols, config);
  };

const createTestSocketLayer = (config: TestSocketConfig = {}) =>
  Layer.succeed(Socket.WebSocketConstructor, createTestWebSocketConstructor(config));

// =============================================================================
// Mock WebSocket Factory Tests
// =============================================================================

const waitForConnectedState = (transport: {
  readonly connectionState: Stream.Stream<string, never, never>;
}) =>
  pipe(
    transport.connectionState,
    Stream.filter((state) => state === 'connected'),
    Stream.take(1),
    Stream.runDrain,
    Effect.map(() => {
      expect(true).toBe(true);
    })
  );

describe('WebSocket Transport - Mock Factory', () => {
  it.scoped('should create mock WebSocket with proper state transitions', () =>
    pipe(
      WebSocketConnector.connect('ws://test.example.com'),
      Effect.provide(createTestSocketLayer({ openDelay: 100 })),
      Effect.flatMap(waitForConnectedState)
    )
  );
});

// =============================================================================
// Error Scenario Tests
// =============================================================================

describe('WebSocket Transport - Error Scenarios', () => {
  it.scoped('should fail when WebSocket connection fails', () =>
    pipe(
      WebSocketConnector.connect('ws://test.example.com'),
      Effect.provide(createTestSocketLayer({ shouldFailConnection: true })),
      Effect.flip,
      Effect.map((error) => {
        expect(error).toBeInstanceOf(ConnectionError);
        expect(error.message).toContain('WebSocket connection failed');
      })
    )
  );

  it.scoped('should handle WebSocket error before open', () =>
    pipe(
      WebSocketConnector.connect('ws://test.example.com'),
      Effect.provide(createTestSocketLayer({ shouldFailBeforeOpen: true })),
      Effect.flip,
      Effect.map((error) => {
        expect(error).toBeInstanceOf(ConnectionError);
        expect(error.message).toContain('WebSocket connection failed');
      })
    )
  );

  it.scoped('should handle WebSocket close before open (connection refused)', () =>
    pipe(
      WebSocketConnector.connect('ws://test.example.com'),
      Effect.provide(createTestSocketLayer({ shouldCloseBeforeOpen: true })),
      Effect.flip,
      Effect.map((error) => {
        expect(error).toBeInstanceOf(ConnectionError);
        expect(error.message).toContain('WebSocket connection failed');
      })
    )
  );

  it.scoped('should handle connection with very long delay', () =>
    pipe(
      WebSocketConnector.connect('ws://test.example.com'),
      Effect.provide(createTestSocketLayer({ openDelay: 2000 })),
      Effect.flatMap(waitForConnectedState)
    )
  );
});

// =============================================================================
// WebSocket-Specific Message Handling Tests
// =============================================================================

const takeFirstMessage = <E, R>(subscription: Stream.Stream<unknown, E, R>) =>
  pipe(
    subscription,
    Stream.take(1),
    Stream.runHead,
    Effect.map((message) => {
      expect(Option.isSome(message)).toBe(true);
      if (Option.isSome(message)) {
        expect((message.value as { readonly id: string }).id).toBe('valid-id');
      }
    })
  );

const subscribeAndTakeFirst = <E, R>(transport: {
  readonly subscribe: () => Effect.Effect<Stream.Stream<unknown, never, never>, E, R>;
}) => pipe(transport.subscribe(), Effect.flatMap(takeFirstMessage));

describe('WebSocket Transport - WebSocket-Specific Behavior', () => {
  it.scoped('should handle malformed JSON messages (WebSocket binary data)', () =>
    pipe(
      WebSocketConnector.connect('ws://test.example.com'),
      Effect.provide(
        createTestSocketLayer({
          preloadedMessages: [
            new TextEncoder().encode('invalid json'),
            new TextEncoder().encode(
              JSON.stringify(makeTransportMessage('valid-id', 'test-type', '{"data":"test"}'))
            ),
          ],
        })
      ),
      Effect.flatMap(subscribeAndTakeFirst)
    )
  );
});

// =============================================================================
// Edge Case Tests
// =============================================================================

describe('WebSocket Transport - Edge Cases', () => {
  it.scoped('should handle connection to non-existent server', () =>
    pipe(
      // Try to connect to a port that's very unlikely to be in use
      WebSocketConnector.connect('ws://localhost:59999'),
      Effect.map((transport) => {
        // With Socket abstraction, connection might succeed initially
        // but fail when actually trying to use the connection
        // This is valid according to the Transport interface
        expect(transport).toBeDefined();
        expect(transport.connectionState).toBeDefined();
        expect(transport.publish).toBeDefined();
        expect(transport.subscribe).toBeDefined();
      }),
      Effect.catchAll((error) => {
        // Or it might fail immediately - both are valid
        expect(error.message).toContain('failed');
        return Effect.void;
      })
    )
  );

  it.skip('should handle invalid protocol URL - skipped due to test runner timeout issues', () => {
    // Invalid URL - Socket abstraction times out after 3 seconds
    // but test runner times out before that can complete
    // This test is skipped due to timeout issues with the test runner
    // When enabled, would test: WebSocketConnector.connect('not-a-websocket-url')
  });
});
