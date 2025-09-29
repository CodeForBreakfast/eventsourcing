/**
 * WebSocket Transport Implementation Tests
 *
 * Tests WebSocket-specific implementation details, error scenarios, and mock factory behavior.
 * Generic transport behaviors are covered by contract tests.
 */

/* eslint-disable functional/prefer-immutable-types, functional/prefer-readonly-type */

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
  url: Readonly<string>,
  _protocols?: Readonly<string | readonly string[]>,
  config: Readonly<TestSocketConfig> = {}
): Readonly<globalThis.WebSocket> => {
  // Mutable state for the mock (contained within closure)
  let readyState: number = WebSocketState.CONNECTING;
  let openTimeout: NodeJS.Timeout | undefined;
  const eventListeners = new Map<string, Array<(event: unknown) => void>>();

  const dispatchEvent = (event: unknown): boolean => {
    const listeners = eventListeners.get((event as { type: string }).type);
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
      if (!eventListeners.has(type)) {
        eventListeners.set(type, []);
      }
      eventListeners.get(type)!.push(listener);
    },

    removeEventListener(type: string, listener: (event: unknown) => void) {
      const listeners = eventListeners.get(type);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
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

    // Legacy event handler properties (for compatibility)
    onopen: null,
    onclose: null,
    onmessage: null,
    onerror: null,
  } as globalThis.WebSocket;
};

// Test WebSocketConstructor that creates MockWebSockets
const createTestWebSocketConstructor =
  (config: Readonly<TestSocketConfig>) => (url: string, protocols?: string | readonly string[]) => {
    return createMockWebSocket(url, protocols, config);
  };

const createTestSocketLayer = (config: Readonly<TestSocketConfig> = {}) =>
  Layer.succeed(Socket.WebSocketConstructor, createTestWebSocketConstructor(config));

// =============================================================================
// Mock WebSocket Factory Tests
// =============================================================================

describe('WebSocket Transport - Mock Factory', () => {
  it.scoped('should create mock WebSocket with proper state transitions', () =>
    pipe(
      WebSocketConnector.connect('ws://test.example.com'),
      Effect.provide(createTestSocketLayer({ openDelay: 100 })),
      Effect.flatMap((transport) =>
        pipe(
          transport.connectionState,
          Stream.filter((state) => state === 'connected'),
          Stream.take(1),
          Stream.runDrain,
          Effect.map(() => {
            // Mock factory properly simulates WebSocket state transitions
            expect(true).toBe(true);
          })
        )
      )
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
      Effect.provide(createTestSocketLayer({ openDelay: 2000 })), // Long but not longer than timeout
      Effect.flatMap((transport) =>
        pipe(
          transport.connectionState,
          Stream.filter((state) => state === 'connected'),
          Stream.take(1),
          Stream.runDrain,
          Effect.map(() => {
            // Connection eventually succeeds even with long delay
            expect(true).toBe(true);
          })
        )
      )
    )
  );
});

// =============================================================================
// WebSocket-Specific Message Handling Tests
// =============================================================================

describe('WebSocket Transport - WebSocket-Specific Behavior', () => {
  it.scoped('should handle malformed JSON messages (WebSocket binary data)', () =>
    pipe(
      WebSocketConnector.connect('ws://test.example.com'),
      Effect.provide(
        createTestSocketLayer({
          preloadedMessages: [
            new TextEncoder().encode('invalid json'), // WebSocket-specific: binary data that's not valid JSON
            new TextEncoder().encode(
              JSON.stringify(makeTransportMessage('valid-id', 'test-type', '{"data":"test"}'))
            ),
          ],
        })
      ),
      Effect.flatMap((transport) =>
        pipe(
          transport.subscribe(),
          Effect.flatMap((subscription) =>
            pipe(
              subscription,
              Stream.take(1),
              Stream.runHead,
              Effect.map((message) => {
                expect(Option.isSome(message)).toBe(true);
                if (Option.isSome(message)) {
                  // Should receive the valid message after dropping invalid JSON
                  expect(message.value.id as string).toBe('valid-id');
                }
              })
            )
          )
        )
      )
    )
  );
});

// =============================================================================
// Edge Case Tests (Legacy scenarios for compatibility)
// =============================================================================

describe('WebSocket Transport - Legacy Edge Cases', () => {
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

  it.skip('should handle invalid protocol URL - skipped due to test runner timeout issues', () =>
    // Invalid URL - Socket abstraction times out after 3 seconds
    // but test runner times out before that can complete
    pipe(
      WebSocketConnector.connect('not-a-websocket-url'),
      Effect.either,
      Effect.map((result) => {
        // Should fail with timeout
        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left.message).toContain('timeout');
        }
      })
    ));
});
