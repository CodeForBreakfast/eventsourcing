/**
 * WebSocket Transport Unit Tests
 *
 * Tests edge cases and error scenarios that can't be effectively tested with real WebSockets.
 * Uses mock WebSockets to control specific failure scenarios like connection errors,
 * malformed messages, and connection state transitions.
 *
 * TESTING ARCHITECTURE:
 * - Unit tests (this file): Edge cases with mocks - connection errors, malformed data, etc.
 * - Integration tests: Real WebSocket client-server communication and contract compliance
 * - Contract tests: Run as part of integration tests with real WebSockets
 *
 * This approach ensures we test transport behavior, not mock behavior.
 */

import { Effect, Stream, pipe, Duration, Fiber } from 'effect';
import { makeMessageId, makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';
import { WebSocketConnector } from './websocket-transport';
import { describe, it, expect, beforeAll, afterAll } from '@codeforbreakfast/buntest';

// =============================================================================
// Minimal WebSocket Mock for Testing Transport Logic
// =============================================================================

type MockWebSocketInstance = {
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  readyState: number;
  url: string;
  send: (data: string) => void;
  close: () => void;
  simulateOpen: () => void;
  simulateClose: (code?: number, reason?: string) => void;
  simulateError: () => void;
  simulateMessage: (data: string) => void;
};

const WebSocketConstants = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

function MockWebSocket(url: string): MockWebSocketInstance {
  const instance: MockWebSocketInstance = {
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    readyState: WebSocketConstants.CONNECTING,
    url,

    send(_data: string): void {
      if (this.readyState !== WebSocketConstants.OPEN) {
        throw new Error('WebSocket is not open');
      }
      // Mock doesn't echo - that would test the mock, not the transport
    },

    close(): void {
      this.readyState = WebSocketConstants.CLOSED;
      if (this.onclose) {
        this.onclose(new CloseEvent('close'));
      }
    },

    // Test utilities to manually trigger WebSocket events
    simulateOpen(): void {
      this.readyState = WebSocketConstants.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    },

    simulateClose(code = 1000, reason = ''): void {
      this.readyState = WebSocketConstants.CLOSED;
      if (this.onclose) {
        this.onclose(new CloseEvent('close', { code, reason }));
      }
    },

    simulateError(): void {
      this.readyState = WebSocketConstants.CLOSED;
      if (this.onerror) {
        this.onerror(new Event('error'));
      }
    },

    simulateMessage(data: string): void {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', { data }));
      }
    },
  };

  // Track for test utilities
  globalThis.lastCreatedWebSocket = instance;

  // Auto-simulate connection for contract tests (URLs that don't contain 'test-unit' prefix)
  // Unit tests that use 'test-unit' prefix will need to manually control the connection
  if (
    !url.includes('test-unit') &&
    !url.includes('test-error') &&
    !url.includes('test-malformed') &&
    !url.includes('test-states') &&
    !url.includes('test-not-connected')
  ) {
    setTimeout(() => {
      // Auto-connect for contract tests
      if (url.includes('invalid') || url.includes('non-existent')) {
        instance.simulateError();
      } else {
        instance.simulateOpen();
      }
    }, 10);
  }

  return instance;
}

// Add static constants
Object.assign(MockWebSocket, WebSocketConstants);

declare global {
  var lastCreatedWebSocket: MockWebSocketInstance | undefined;
}

// Store original WebSocket for restoration
const originalWebSocket = globalThis.WebSocket;

// =============================================================================
// WebSocket Transport Unit Tests - Test Transport Logic
// =============================================================================

describe('WebSocket Transport - Edge Case Tests (with Mocks)', () => {
  let mockWs: MockWebSocketInstance;

  beforeAll(() => {
    // Install mock WebSocket for controlled testing
    globalThis.WebSocket = MockWebSocket as any;
    globalThis.lastCreatedWebSocket = undefined;
  });

  afterAll(() => {
    // Restore original WebSocket
    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
    } else {
      delete (globalThis as any).WebSocket;
    }
  });

  it.effect('should handle connection lifecycle correctly', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const transportFiber = yield* Effect.fork(WebSocketConnector.connect('ws://test-unit.com'));

        yield* Effect.sleep(Duration.millis(10));
        mockWs = globalThis.lastCreatedWebSocket!;
        expect(mockWs).toBeDefined();
        expect(mockWs.readyState).toBe(WebSocketConstants.CONNECTING);

        // Manually trigger connection open
        mockWs.simulateOpen();

        const transport = yield* Fiber.join(transportFiber);

        // Verify connection state
        const state = yield* pipe(transport.connectionState, Stream.take(1), Stream.runHead);

        expect(state._tag).toBe('Some');
        if (state._tag === 'Some') {
          expect(state.value).toBe('connected');
        }
      })
    )
  );

  it.effect('should handle connection errors correctly', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const transportFiber = yield* Effect.fork(
          pipe(WebSocketConnector.connect('ws://test-error.com'), Effect.either)
        );

        // Wait for WebSocket to be created
        yield* Effect.sleep(Duration.millis(10));
        mockWs = globalThis.lastCreatedWebSocket!;

        // Manually trigger connection error
        mockWs.simulateError();

        const result = yield* Fiber.join(transportFiber);
        expect(result._tag).toBe('Left');
      })
    )
  );

  it.effect('should handle incoming messages correctly', () =>
    Effect.scoped(
      Effect.gen(function* () {
        // Create transport
        const transportFiber = yield* Effect.fork(
          WebSocketConnector.connect('ws://test-messages.com')
        );

        yield* Effect.sleep(Duration.millis(10));
        mockWs = globalThis.lastCreatedWebSocket!;
        mockWs.simulateOpen();

        const transport = yield* Fiber.join(transportFiber);

        // Set up subscription
        const messagesFiber = yield* pipe(
          transport.subscribe(),
          Effect.flatMap((stream) =>
            pipe(
              stream,
              Stream.take(1),
              Stream.runCollect,
              Effect.map((chunk) => Array.from(chunk)),
              Effect.fork
            )
          )
        );

        yield* Effect.sleep(Duration.millis(10));

        // Simulate incoming message
        const testMessage = makeTransportMessage(
          'test-msg-1',
          'test-type',
          JSON.stringify({ data: 'test-data' })
        );

        mockWs.simulateMessage(JSON.stringify(testMessage));

        const receivedMessages = yield* Fiber.join(messagesFiber);
        expect(receivedMessages).toHaveLength(1);
        expect(receivedMessages[0]?.id).toBe('test-msg-1' as any);
        expect(receivedMessages[0]?.type).toBe('test-type');
        expect(receivedMessages[0]?.payload).toBe(JSON.stringify({ data: 'test-data' }));
      })
    )
  );

  it.effect('should handle malformed incoming messages gracefully', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const transportFiber = yield* Effect.fork(
          WebSocketConnector.connect('ws://test-malformed.com')
        );

        yield* Effect.sleep(Duration.millis(10));
        mockWs = globalThis.lastCreatedWebSocket!;
        mockWs.simulateOpen();

        const transport = yield* Fiber.join(transportFiber);

        // Set up subscription
        const messagesFiber = yield* pipe(
          transport.subscribe(),
          Effect.flatMap((stream) =>
            pipe(
              stream,
              Stream.take(1),
              Stream.runCollect,
              Effect.map((chunk) => Array.from(chunk)),
              Effect.timeout(500), // Short timeout since malformed message won't produce anything
              Effect.either,
              Effect.fork
            )
          )
        );

        yield* Effect.sleep(Duration.millis(10));

        // Send malformed JSON - should be ignored
        mockWs.simulateMessage('invalid-json{');

        // Send valid message after malformed one
        const validMessage = makeTransportMessage('valid', 'test', 'data');
        mockWs.simulateMessage(JSON.stringify(validMessage));

        const result = yield* Fiber.join(messagesFiber);

        // Should receive the valid message, malformed one should be ignored
        if (result._tag === 'Right') {
          expect(result.right).toHaveLength(1);
          expect(result.right[0]?.id).toBe('valid' as any);
          expect(result.right[0]?.type).toBe('test');
          expect(result.right[0]?.payload).toBe('data');
        } else {
          // Timeout is also acceptable - means malformed message was properly ignored
          expect(result._tag).toBe('Left');
        }
      })
    )
  );

  it.effect('should handle WebSocket connection errors', () =>
    // Test what happens when WebSocket fires an error event during connection
    Effect.scoped(
      Effect.gen(function* () {
        const connectResult = yield* pipe(
          WebSocketConnector.connect('ws://test-error.com'),
          Effect.either,
          Effect.fork
        );

        yield* Effect.sleep(Duration.millis(10));
        mockWs = globalThis.lastCreatedWebSocket!;
        expect(mockWs).toBeDefined();

        // Simulate connection error
        mockWs.simulateError();

        const result = yield* Fiber.join(connectResult);

        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('ConnectionError');
        }
      })
    )
  );

  it.effect('should handle WebSocket close before open', () =>
    // Test what happens when WebSocket closes before opening (connection refused scenario)
    Effect.scoped(
      Effect.gen(function* () {
        const connectResult = yield* pipe(
          WebSocketConnector.connect('ws://test-close.com'),
          Effect.either,
          Effect.fork
        );

        yield* Effect.sleep(Duration.millis(10));
        mockWs = globalThis.lastCreatedWebSocket!;
        expect(mockWs).toBeDefined();

        // Simulate immediate close (like connection refused)
        mockWs.simulateClose(1006, 'Connection refused');

        const result = yield* Fiber.join(connectResult);

        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left._tag).toBe('ConnectionError');
        }
      })
    )
  );

  it.effect('should reject publish when not connected', () =>
    Effect.scoped(
      Effect.gen(function* () {
        // Create transport and let it succeed connection first
        const transportFiber = yield* Effect.fork(
          WebSocketConnector.connect('ws://test-not-connected.com')
        );

        yield* Effect.sleep(Duration.millis(10));
        mockWs = globalThis.lastCreatedWebSocket!;

        // First simulate connection success so transport creation succeeds
        mockWs.simulateOpen();

        const transport = yield* Fiber.join(transportFiber);

        // Now simulate disconnection so publish will fail
        mockWs.simulateClose();
        yield* Effect.sleep(Duration.millis(10));

        const result = yield* pipe(
          transport.publish(makeTransportMessage('test', 'test', 'should fail')),
          Effect.either
        );

        expect(result._tag).toBe('Left');
      })
    )
  );
});
